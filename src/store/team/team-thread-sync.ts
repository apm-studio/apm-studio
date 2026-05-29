import { teamRuntimeApi } from '../../api-clients/team-runtime'
import { showToast } from '../../lib/toast'
import { buildTeamParticipantChatKey, parseTeamParticipantChatKey } from '../../../shared/chat-targets'
import { buildTeamDefinition } from '../../../shared/team-definition-builder'
import type { WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import type {
    TeamDefinition,
    TeamParticipantSessionStatus,
} from '../../../shared/team-types'
import type { StudioState } from '../types'
import { clearChatSessionView, registerSessionBinding, syncSessionSnapshot } from '../session'
import {
    ensureSessionRuntimeActor,
    patchSessionRuntimeActor,
    reconcileSessionRuntimeActor,
    releaseSessionRuntimeActor,
} from '../session/session-runtime-manager'
import {
    buildTeamThreadSelectionState,
    resolveSelectedTeamThreadState,
} from './selection-state'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

const teamRuntimeSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()

type TeamThreadRuntimeSnapshot = {
    id: string
    teamId: string
    name?: string
    status: 'active' | 'idle' | 'completed' | 'interrupted'
    participantSessions: Record<string, string>
    participantStatuses?: Record<string, TeamParticipantSessionStatus>
    createdAt: number
}

export function collectRemovedTeamParticipantChatKeys(
    state: Pick<StudioState, 'chatKeyToSession'>,
    teamId: string,
    nextThreadIds: Set<string>,
    authoritativeSessions: Record<string, string>,
) {
    return Object.keys(state.chatKeyToSession).filter((key) => {
        const parsed = parseTeamParticipantChatKey(key)
        if (!parsed || parsed.teamId !== teamId) {
            return false
        }

        return !nextThreadIds.has(parsed.threadId) || !(key in authoritativeSessions)
    })
}

export function listTeamThreadChatKeys(
    state: Pick<StudioState, 'chatKeyToSession'>,
    teamId: string,
    threadId: string,
) {
    return Object.keys(state.chatKeyToSession).filter((key) => {
        const parsed = parseTeamParticipantChatKey(key)
        return parsed?.teamId === teamId && parsed.threadId === threadId
    })
}

function buildTeamThreadState(thread: TeamThreadRuntimeSnapshot) {
    return {
        id: thread.id,
        teamId: thread.teamId,
        ...(thread.name ? { name: thread.name } : {}),
        status: thread.status,
        participantSessions: thread.participantSessions || {},
        participantStatuses: thread.participantStatuses || {},
        createdAt: thread.createdAt,
    }
}

function transitionedToSettledStatus(
    previous: TeamParticipantSessionStatus | undefined,
    next: TeamParticipantSessionStatus | undefined,
) {
    const wasActive = previous?.type === 'busy' || previous?.type === 'retry'
    const isSettled = next?.type === 'idle' || next?.type === 'error'
    return wasActive && isSettled
}

export async function applyAuthoritativeTeamThreads(
    get: GetState,
    set: SetState,
    teamId: string,
    threads: TeamThreadRuntimeSnapshot[],
) {
    const previousThreads = get().teamThreads[teamId] || []
    const previousById = new Map(previousThreads.map((thread) => [thread.id, thread]))
    const nextThreadIds = new Set(threads.map((thread) => thread.id))
    const authoritativeSessions: Record<string, string> = {}
    const sessionsToFetch = new Set<string>()
    const removedChatKeys: string[] = []

    set((state: StudioState) => {
        removedChatKeys.push(
            ...collectRemovedTeamParticipantChatKeys(state, teamId, nextThreadIds, Object.fromEntries(
                threads.flatMap((thread) => Object.entries(thread.participantSessions || {}).map(([participantKey, sessionId]) => [
                    buildTeamParticipantChatKey(teamId, thread.id, participantKey),
                    sessionId,
                ])),
            )),
        )

        for (const thread of threads) {
            const previousThread = previousById.get(thread.id)
            for (const [participantKey, sessionId] of Object.entries(thread.participantSessions || {})) {
                if (!sessionId) continue
                const chatKey = buildTeamParticipantChatKey(teamId, thread.id, participantKey)
                authoritativeSessions[chatKey] = sessionId

                const previousSessionId = previousThread?.participantSessions?.[participantKey]
                const previousStatus = previousThread?.participantStatuses?.[participantKey]
                const nextStatus = thread.participantStatuses?.[participantKey]
                const shouldFetch = state.chatKeyToSession[chatKey] !== sessionId
                    || !(state.seMessages[sessionId]?.length)
                    || transitionedToSettledStatus(previousStatus, nextStatus)
                    || previousSessionId !== sessionId
                if (shouldFetch) {
                    sessionsToFetch.add(chatKey)
                }
            }
        }

        return {
            teamThreads: {
                ...state.teamThreads,
                [teamId]: threads.map(buildTeamThreadState),
            },
            ...resolveSelectedTeamThreadState(state, teamId, threads),
        }
    })

    for (const chatKey of removedChatKeys) {
        releaseSessionRuntimeActor(set, get, { chatKey })
        clearChatSessionView(get, chatKey)
    }

    for (const [chatKey, sessionId] of Object.entries(authoritativeSessions)) {
        registerSessionBinding(set, get, chatKey, sessionId)
        ensureSessionRuntimeActor(set, get, chatKey, sessionId)
        const parsed = parseTeamParticipantChatKey(chatKey)
        if (!parsed) continue
        const thread = threads.find((entry) => entry.id === parsed.threadId)
        const participantStatus = thread?.participantStatuses?.[parsed.participantKey]
        if (!participantStatus) continue
        get().setSessionStatus(sessionId, participantStatus)
        if (participantStatus.type === 'idle' || participantStatus.type === 'error') {
            patchSessionRuntimeActor(set, get, {
                chatKey,
                sessionId,
                patch: { optimistic: false, syncing: false },
            })
        }
        reconcileSessionRuntimeActor(set, get, chatKey, sessionId)
    }

    for (const chatKey of sessionsToFetch) {
        const sessionId = authoritativeSessions[chatKey]
        if (!sessionId) continue
        syncSessionSnapshot(set, get, chatKey, sessionId).catch(() => {
            // Session may have been deleted or compacted; ignore background refresh failure.
        })
    }
}

export function buildServerTeamDefinition(team: WorkspaceTeamSnapshot, agents: StudioState['agents'] = []): TeamDefinition {
    return buildTeamDefinition(team, agents)
}

function hasLiveRuntimeThreads(state: StudioState, teamId: string) {
    return (state.teamThreads[teamId] || []).some((thread) => thread.status === 'active' || thread.status === 'idle')
}

export function scheduleTeamRuntimeSync(get: GetState, set: SetState, teamId: string, delay = 300) {
    const existing = teamRuntimeSyncTimers.get(teamId)
    if (existing) {
        clearTimeout(existing)
    }

    teamRuntimeSyncTimers.set(teamId, setTimeout(() => {
        teamRuntimeSyncTimers.delete(teamId)
        const currentState = get()
        const team = currentState.teams.find((entry) => entry.id === teamId)
        if (!team || !hasLiveRuntimeThreads(currentState, teamId)) {
            return
        }

        void currentState.saveWorkspace()
            .catch((error) => {
                console.warn('[team-sync] Failed to persist workspace before runtime sync', error)
            })
            .then(async () => {
                const latestState = get()
                const latestTeam = latestState.teams.find((entry) => entry.id === teamId)
                if (!latestTeam || !hasLiveRuntimeThreads(latestState, teamId)) {
                    return
                }

                try {
                    await teamRuntimeApi.syncDefinition(teamId, buildServerTeamDefinition(latestTeam, latestState.agents))
                    await loadTeamThreadsImpl(get, set, teamId)
                } catch (error) {
                    console.error('[team-sync] Failed to sync Team runtime definition', error)
                    showToast('APM Studio could not sync the running Team threads.', 'error', {
                        title: 'Team sync failed',
                        dedupeKey: `team:sync:${teamId}`,
                    })
                }
            })
    }, delay))
}

export async function createTeamThreadImpl(get: GetState, set: SetState, teamId: string) {
    const team = get().teams.find((entry) => entry.id === teamId)
    const teamDefinition = team ? buildServerTeamDefinition(team, get().agents) : undefined
    await get().saveWorkspace()
    const result = await teamRuntimeApi.createThread(teamId, teamDefinition)
    const thread = result.thread

    set((state) => buildTeamThreadSelectionState(state, teamId, thread.id))
    await loadTeamThreadsImpl(get, set, teamId)

    return thread.id
}

export async function loadTeamThreadsImpl(get: GetState, set: SetState, teamId: string) {
    const result = await teamRuntimeApi.listThreads(teamId)
    await applyAuthoritativeTeamThreads(get, set, teamId, result.threads)
}
