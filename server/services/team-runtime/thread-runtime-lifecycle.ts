import type {
    TeamDefinition,
    TeamThread,
    TeamThreadStatus,
    TeamThreadSummary,
} from '../../../shared/team-types.js'
import { EventLogger } from './event-logger.js'
import { Mailbox } from './mailbox.js'
import {
    buildThreadRuntimeSummary,
    type DeletedThreadRuntime,
    type ThreadRuntime,
} from './thread-runtime-state.js'

export function isActiveThreadStatus(status: TeamThreadStatus) {
    return status === 'active' || status === 'idle'
}

export function createThreadRuntime(params: {
    workspaceId: string
    teamId: string
    threadId: string
    createdAt: number
    teamDefinition?: TeamDefinition
}): ThreadRuntime {
    const thread: TeamThread = {
        id: params.threadId,
        teamId: params.teamId,
        mailbox: {
            pendingMessages: [],
            board: {},
            wakeConditions: [],
        },
        participantSessions: {},
        participantStatuses: {},
        createdAt: params.createdAt,
        status: 'active',
    }

    return {
        thread,
        mailbox: new Mailbox(),
        eventLogger: new EventLogger(params.workspaceId, params.teamId, params.threadId),
        teamDefinition: params.teamDefinition,
        retiredParticipantSessions: {},
    }
}

export function collectRuntimeSessionIds(runtime: ThreadRuntime): string[] {
    return Array.from(new Set([
        ...Object.values(runtime.thread.participantSessions || {}),
        ...Object.values(runtime.retiredParticipantSessions || {}).flat(),
    ].filter(Boolean)))
}

export function deletedRuntimeResult(runtime: ThreadRuntime | null | undefined): DeletedThreadRuntime {
    if (!runtime) {
        return {
            deleted: false,
            teamId: null,
            sessionIds: [],
        }
    }
    return {
        deleted: true,
        teamId: runtime.thread.teamId,
        sessionIds: collectRuntimeSessionIds(runtime),
    }
}

export function listThreadRuntimeIds(
    runtimes: Iterable<ThreadRuntime>,
    teamId: string,
    statuses?: TeamThreadStatus[],
): string[] {
    const allowed = statuses ? new Set(statuses) : null
    const ids: string[] = []
    for (const runtime of runtimes) {
        if (runtime.thread.teamId !== teamId) continue
        if (allowed && !allowed.has(runtime.thread.status)) continue
        ids.push(runtime.thread.id)
    }
    return ids
}

export function listThreadRuntimeSummaries(
    runtimes: Iterable<ThreadRuntime>,
    teamId: string,
): TeamThreadSummary[] {
    const results: TeamThreadSummary[] = []
    for (const runtime of runtimes) {
        if (runtime.thread.teamId === teamId) {
            results.push(buildThreadRuntimeSummary(runtime))
        }
    }
    return results
}
