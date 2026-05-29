import type { WorkspaceAgentNode } from '../../../shared/workspace-contracts'
import { buildTeamParticipantChatKey, parseTeamParticipantChatKey } from '../../../shared/chat-targets'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'
import { chatApi } from '../../api-clients/chat'
import { isStudioApiNotFoundError } from '../../lib/api-errors'
import { showToast } from '../../lib/toast'
import type { StudioState } from '../types'
import { clearChatSessionView } from './session-commands'
import { releaseSessionRuntimeActor } from './session-runtime-manager'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export type SessionCleanupTarget = {
    chatKey: string
    sessionId: string
}

function uniqueTargets(targets: SessionCleanupTarget[]) {
    const seen = new Set<string>()
    return targets.filter((target) => {
        const key = `${target.chatKey}:${target.sessionId}`
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

function targetFromChatKey(state: Pick<StudioState, 'chatKeyToSession'>, chatKey: string): SessionCleanupTarget | null {
    const sessionId = state.chatKeyToSession[chatKey]
    return sessionId ? { chatKey, sessionId } : null
}

function targetFromSession(
    state: Pick<StudioState, 'chatKeyToSession'>,
    chatKey: string,
    sessionId: string | null | undefined,
): SessionCleanupTarget | null {
    return targetFromChatKey(state, chatKey) || (sessionId ? { chatKey, sessionId } : null)
}

function agentTeamRef(agent: Pick<WorkspaceAgentNode, 'id' | 'meta'>): SharedPrimitiveRef {
    const derivedFrom = agent.meta?.derivedFrom?.trim()
    if (!derivedFrom) {
        return { kind: 'draft', draftId: agent.id }
    }
    if (derivedFrom.startsWith('draft:')) {
        return { kind: 'draft', draftId: derivedFrom.slice('draft:'.length) }
    }
    return { kind: 'registry', urn: derivedFrom }
}

function samePrimitiveRef(left: SharedPrimitiveRef, right: SharedPrimitiveRef) {
    return (left.kind === 'draft' && right.kind === 'draft' && left.draftId === right.draftId)
        || (left.kind === 'registry' && right.kind === 'registry' && left.urn === right.urn)
}

export function collectTeamSessionTargets(
    state: Pick<StudioState, 'teamThreads' | 'chatKeyToSession'>,
    teamId: string,
): SessionCleanupTarget[] {
    const targets = Object.entries(state.chatKeyToSession)
        .filter(([chatKey]) => parseTeamParticipantChatKey(chatKey)?.teamId === teamId)
        .map(([chatKey, sessionId]) => ({ chatKey, sessionId }))

    for (const thread of state.teamThreads[teamId] || []) {
        for (const [participantKey, sessionId] of Object.entries(thread.participantSessions || {})) {
            const chatKey = buildTeamParticipantChatKey(teamId, thread.id, participantKey)
            const target = targetFromSession(state, chatKey, sessionId)
            if (target) {
                targets.push(target)
            }
        }
    }

    return uniqueTargets(targets)
}

export function collectTeamThreadSessionTargets(
    state: Pick<StudioState, 'teamThreads' | 'chatKeyToSession'>,
    teamId: string,
    threadId: string,
): SessionCleanupTarget[] {
    const targets = Object.entries(state.chatKeyToSession)
        .filter(([chatKey]) => {
            const parsed = parseTeamParticipantChatKey(chatKey)
            return parsed?.teamId === teamId && parsed.threadId === threadId
        })
        .map(([chatKey, sessionId]) => ({ chatKey, sessionId }))

    const thread = (state.teamThreads[teamId] || []).find((entry) => entry.id === threadId)
    if (thread) {
        for (const [participantKey, sessionId] of Object.entries(thread.participantSessions || {})) {
            const chatKey = buildTeamParticipantChatKey(teamId, threadId, participantKey)
            const target = targetFromSession(state, chatKey, sessionId)
            if (target) {
                targets.push(target)
            }
        }
    }

    return uniqueTargets(targets)
}

export function collectAgentSessionTargets(
    state: Pick<StudioState, 'teams' | 'teamThreads' | 'chatKeyToSession'>,
    agent: Pick<WorkspaceAgentNode, 'id' | 'meta'>,
): SessionCleanupTarget[] {
    const targets: SessionCleanupTarget[] = []
    const direct = targetFromChatKey(state, agent.id)
    if (direct) {
        targets.push(direct)
    }

    const ref = agentTeamRef(agent)
    for (const team of state.teams) {
        const participantKeys = Object.entries(team.participants || {})
            .filter(([, binding]) => samePrimitiveRef(binding.agentRef, ref))
            .map(([participantKey]) => participantKey)
        if (participantKeys.length === 0) {
            continue
        }
        const participantKeySet = new Set(participantKeys)
        for (const thread of state.teamThreads[team.id] || []) {
            for (const participantKey of participantKeySet) {
                const target = targetFromSession(
                    state,
                    buildTeamParticipantChatKey(team.id, thread.id, participantKey),
                    thread.participantSessions?.[participantKey],
                )
                if (target) {
                    targets.push(target)
                }
            }
        }
        for (const [chatKey, sessionId] of Object.entries(state.chatKeyToSession)) {
            const parsed = parseTeamParticipantChatKey(chatKey)
            if (parsed?.teamId === team.id && participantKeySet.has(parsed.participantKey)) {
                targets.push({ chatKey, sessionId })
            }
        }
    }

    return uniqueTargets(targets)
}

export function detachSessionTargets(
    set: SetState,
    get: GetState,
    targets: SessionCleanupTarget[],
) {
    if (targets.length === 0) {
        return
    }

    const sessionIds = new Set(targets.map((target) => target.sessionId))
    for (const target of targets) {
        releaseSessionRuntimeActor(set, get, target)
        clearChatSessionView(get, target.chatKey)
        get().removeSession(target.sessionId)
    }

    set((state) => ({
        selectedAgentSessionId: state.selectedAgentSessionId && sessionIds.has(state.selectedAgentSessionId)
            ? null
            : state.selectedAgentSessionId,
        sessions: state.sessions.filter((session) => !sessionIds.has(session.id)),
    }))
}

export function deleteSessionTargetsRemotely(
    targets: SessionCleanupTarget[],
    options?: {
        title?: string
        dedupeKey?: string
    },
) {
    const sessionIds = Array.from(new Set(targets.map((target) => target.sessionId)))
    if (sessionIds.length === 0) {
        return
    }

    void Promise.all(sessionIds.map(async (sessionId) => {
        try {
            await chatApi.deleteSession(sessionId)
        } catch (error) {
            if (isStudioApiNotFoundError(error)) {
                return
            }
            console.error('Failed to delete session during lifecycle cleanup', { sessionId, error })
            throw error
        }
    })).catch(() => {
        showToast('Studio could not delete every linked thread for this item.', 'error', {
            title: options?.title || 'Thread cleanup failed',
            dedupeKey: options?.dedupeKey || `thread:lifecycle-cleanup:${sessionIds.join(',')}`,
        })
    })
}
