import { nanoid } from 'nanoid'
import type {
    MailboxEvent,
    TeamDefinition,
    TeamRuntimeErrorResponse,
    TeamThreadCreateResponse,
    TeamThreadEventsResponse,
    TeamThreadResponse,
    TeamThreadsResponse,
    TeamThreadSummary,
} from '../../../shared/team-types.js'
import type { TeamRuntimeActorSystem } from './team-runtime-actors.js'
import type { ThreadManager } from './thread-manager.js'
import { prewarmTeamParticipantProjections } from './participant-projection-prewarm.js'
import { teamRuntimeError } from './team-runtime-results.js'

export async function syncTeamRuntimeDefinition(params: {
    workingDir: string
    teamId: string
    teamDefinition: TeamDefinition
    threadManager: ThreadManager
    actorSystem: TeamRuntimeActorSystem
    clearSafetyGuard: (threadId: string) => void
}): Promise<TeamThreadsResponse> {
    const {
        workingDir,
        teamId,
        teamDefinition,
        threadManager,
        actorSystem,
        clearSafetyGuard,
    } = params
    const threadIds = threadManager.listThreadIds(teamId, ['active', 'idle'])
    let anySynced = false

    for (const threadId of threadIds) {
        const synced = await threadManager.syncThreadTeamDefinition(threadId, teamDefinition)
        if (!synced) continue
        anySynced = true
        actorSystem.markThreadActive(threadId, teamDefinition)
        clearSafetyGuard(threadId)

        const event: MailboxEvent = {
            id: nanoid(),
            type: 'runtime.reconfigured',
            sourceType: 'system',
            source: 'studio',
            timestamp: Date.now(),
            payload: {
                teamId,
                threadId,
                participantCount: Object.keys(teamDefinition.participants || {}).length,
                relationCount: teamDefinition.relations.length,
            },
        }
        await threadManager.logEvent(threadId, event)
    }

    if (anySynced) {
        await prewarmTeamParticipantProjections({
            workingDir,
            teamDefinition,
        })
    }

    return { ok: true as const, threads: threadManager.listThreads(teamId) }
}

export async function createTeamRuntimeThread(params: {
    workingDir: string
    teamId: string
    teamDefinition?: TeamDefinition
    threadManager: ThreadManager
    actorSystem: TeamRuntimeActorSystem
}): Promise<TeamThreadCreateResponse> {
    const thread = await params.threadManager.createThread(params.teamId, params.teamDefinition)
    params.actorSystem.markThreadActive(thread.id, params.teamDefinition)
    await prewarmTeamParticipantProjections({
        workingDir: params.workingDir,
        teamDefinition: params.teamDefinition,
    })
    return {
        ok: true as const,
        thread: params.threadManager.getThreadSummary(thread.id) as TeamThreadSummary,
    }
}

export async function renameTeamRuntimeThread(params: {
    threadId: string
    name: string
    options?: { ifUnset?: boolean }
    threadManager: ThreadManager
}): Promise<TeamThreadResponse | TeamRuntimeErrorResponse> {
    const thread = await params.threadManager.setThreadName(params.threadId, params.name, params.options)
    if (!thread) {
        return teamRuntimeError(`Thread ${params.threadId} not found`, 404)
    }
    return {
        ok: true as const,
        thread,
    }
}

export function listTeamRuntimeThreads(params: {
    teamId: string
    threadManager: ThreadManager
}): TeamThreadsResponse {
    return { ok: true as const, threads: params.threadManager.listThreads(params.teamId) }
}

export function getTeamRuntimeThread(params: {
    threadId: string
    threadManager: ThreadManager
}): TeamThreadResponse | TeamRuntimeErrorResponse {
    const thread = params.threadManager.getThreadSummary(params.threadId)
    if (!thread) {
        return teamRuntimeError(`Thread ${params.threadId} not found`, 404)
    }
    return { ok: true as const, thread }
}

export async function getTeamRuntimeThreadEvents(params: {
    threadId: string
    count?: number
    before?: number
    threadManager: ThreadManager
}): Promise<TeamThreadEventsResponse> {
    const page = await params.threadManager.getRecentEventsPage(params.threadId, params.count, params.before)
    return { ok: true as const, ...page }
}
