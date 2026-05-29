import type { TeamParticipantSessionStatus } from '../../../shared/team-types.js'
import {
    parseTeamSessionOwnershipOwnerId,
    resolveSessionOwnership,
} from '../chat/session-ownership-service.js'
import { getTeamRuntimeService } from './team-runtime-service.js'

export type TeamParticipantSessionRuntimeStatus = Pick<TeamParticipantSessionStatus, 'type' | 'message'>

export type TeamSessionTarget = {
    sessionId: string
    ownerId: string
    workingDir: string
    teamId: string
    threadId: string
    participantKey: string
}

export function parseTeamParticipantSessionOwner(ownerId: string) {
    return parseTeamSessionOwnershipOwnerId(ownerId)
}

export async function resolveTeamSessionTarget(sessionId: string): Promise<TeamSessionTarget | null> {
    const context = await resolveSessionOwnership(sessionId)
    if (!context || context.ownerKind !== 'team') {
        return null
    }

    const parsed = parseTeamParticipantSessionOwner(context.ownerId)
    if (!parsed) {
        return null
    }

    return {
        sessionId,
        ownerId: context.ownerId,
        workingDir: context.workingDir,
        teamId: parsed.teamId,
        threadId: parsed.threadId,
        participantKey: parsed.participantKey,
    }
}

export async function registerTeamParticipantSession(
    workingDir: string,
    ownerId: string,
    sessionId: string,
) {
    const parsed = parseTeamParticipantSessionOwner(ownerId)
    if (!parsed) {
        return false
    }

    const service = getTeamRuntimeService(workingDir)
    await service.registerParticipantSession(parsed.threadId, parsed.participantKey, sessionId)
    return true
}

export async function syncTeamParticipantStatusForSession(
    sessionId: string,
    status: TeamParticipantSessionRuntimeStatus,
) {
    const target = await resolveTeamSessionTarget(sessionId)
    if (!target) {
        return false
    }

    const service = getTeamRuntimeService(target.workingDir)
    await service.registerParticipantSession(target.threadId, target.participantKey, sessionId)
    await service.setParticipantSessionStatus(target.threadId, target.participantKey, status)
    return true
}
