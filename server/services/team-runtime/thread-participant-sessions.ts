import type {
    TeamDefinition,
    TeamParticipantSessionStatus,
} from '../../../shared/team-types.js'
import {
    sameSharedPrimitiveRef,
    type ThreadRuntime,
} from './thread-runtime-state.js'

export function syncRuntimeTeamDefinition(runtime: ThreadRuntime, nextTeamDefinition: TeamDefinition) {
    const previousParticipants = runtime.teamDefinition?.participants || {}
    const nextParticipants = nextTeamDefinition.participants || {}
    const nextSessions = { ...runtime.thread.participantSessions }

    for (const [participantKey, sessionId] of Object.entries(runtime.thread.participantSessions)) {
        const previousBinding = previousParticipants[participantKey]
        const nextBinding = nextParticipants[participantKey]
        const removed = !nextBinding
        const agentChanged = !!previousBinding && !!nextBinding
            && !sameSharedPrimitiveRef(previousBinding.agentRef, nextBinding.agentRef)

        if (removed || agentChanged) {
            retireParticipantSession(runtime, participantKey, sessionId)
            delete nextSessions[participantKey]
            delete runtime.thread.participantStatuses[participantKey]
        }
    }

    runtime.thread.participantSessions = nextSessions
    runtime.teamDefinition = nextTeamDefinition
}

export function setRuntimeParticipantStatus(
    runtime: ThreadRuntime,
    participantKey: string,
    status: Pick<TeamParticipantSessionStatus, 'type' | 'message'>,
): TeamParticipantSessionStatus {
    const nextStatus: TeamParticipantSessionStatus = {
        type: status.type,
        updatedAt: Date.now(),
        ...(status.message ? { message: status.message } : {}),
    }
    runtime.thread.participantStatuses = {
        ...runtime.thread.participantStatuses,
        [participantKey]: nextStatus,
    }
    return nextStatus
}

function retireParticipantSession(runtime: ThreadRuntime, participantKey: string, sessionId: string) {
    runtime.retiredParticipantSessions[participantKey] = [
        ...(runtime.retiredParticipantSessions[participantKey] || []),
        sessionId,
    ]
}
