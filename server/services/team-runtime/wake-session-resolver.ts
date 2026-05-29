import type { TeamDefinition } from '../../../shared/team-types.js'
import { createStudioChatSession } from '../chat/message-service.js'
import { resolveSessionOwnership } from '../chat/session-ownership-service.js'
import { serverDebug } from '../../lib/server-logger.js'
import { formatTeamSessionError } from './team-session-settlement.js'
import type { ThreadManager } from './thread-manager.js'

export async function resolveWakeParticipantSession(params: {
    threadManager: ThreadManager
    teamDefinition: TeamDefinition
    threadId: string
    participantKey: string
    agentName?: string
}): Promise<
    | { ok: true; sessionId: string; executionDir: string }
    | { ok: false; error: string }
> {
    const {
        threadManager,
        teamDefinition,
        threadId,
        participantKey,
        agentName,
    } = params

    const chatKey = `team:${teamDefinition.id}:thread:${threadId}:participant:${participantKey}`
    let sessionId = threadManager.getAgentSession(threadId, participantKey)

    if (!sessionId) {
        try {
            const created = await createStudioChatSession(threadManager.workingDir, {
                agentId: chatKey,
                agentName: agentName || participantKey,
                configHash: '',
                teamId: teamDefinition.id,
            })
            sessionId = created.sessionId
            await threadManager.getOrCreateSession(threadId, participantKey, () => sessionId!)
            serverDebug('wake-cascade', `Auto-created session ${sessionId} for participant "${participantKey}"`)
        } catch (error) {
            return {
                ok: false,
                error: `Failed to auto-create session for ${participantKey}: ${formatTeamSessionError(error)}`,
            }
        }
    }

    const sessionContext = await resolveSessionOwnership(sessionId)
    return {
        ok: true,
        sessionId,
        executionDir: sessionContext?.workingDir || threadManager.workingDir,
    }
}
