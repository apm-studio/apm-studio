import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'
import type {
    TeamDefinition,
    TeamParticipantSessionStatus,
    TeamThread,
    TeamThreadSummary,
} from '../../../shared/team-types.js'
import type { EventLogger } from './event-logger.js'
import type { Mailbox } from './mailbox.js'

export interface ThreadRuntime {
    thread: TeamThread
    mailbox: Mailbox
    eventLogger: EventLogger
    teamDefinition?: TeamDefinition
    retiredParticipantSessions: Record<string, string[]>
}

export type DeletedThreadRuntime = {
    deleted: boolean
    teamId: string | null
    sessionIds: string[]
}

export function sameSharedPrimitiveRef(left: SharedPrimitiveRef, right: SharedPrimitiveRef) {
    if (left.kind !== right.kind) return false
    if (left.kind === 'draft' && right.kind === 'draft') {
        return left.draftId === right.draftId
    }
    if (left.kind === 'registry' && right.kind === 'registry') {
        return left.urn === right.urn
    }
    return false
}

export function cloneParticipantStatuses(participantStatuses: Record<string, TeamParticipantSessionStatus>) {
    return Object.fromEntries(
        Object.entries(participantStatuses || {}).map(([participantKey, status]) => [participantKey, { ...status }]),
    )
}

export function buildThreadRuntimeSummary(runtime: ThreadRuntime): TeamThreadSummary {
    return {
        id: runtime.thread.id,
        teamId: runtime.thread.teamId,
        ...(runtime.thread.name ? { name: runtime.thread.name } : {}),
        participantSessions: { ...runtime.thread.participantSessions },
        participantStatuses: cloneParticipantStatuses(runtime.thread.participantStatuses),
        createdAt: runtime.thread.createdAt,
        status: runtime.thread.status,
    }
}
