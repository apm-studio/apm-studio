import type { ChatSendRequest } from '../../../shared/chat-contracts.js'
import { getTeamDefinitionForThread } from '../team-runtime/team-runtime-service.js'
import { projectTeamTools } from '../team-runtime/team-tool-projection.js'

export type TeamTurnProjection = {
    teamSystemPrompt: string
    projectionAgentId: string
    projectionAgentName: string
}

export async function prepareTeamTurnProjection(input: {
    workingDir: string
    request: ChatSendRequest
    rawAgentId: string
}): Promise<TeamTurnProjection> {
    const {
        workingDir,
        request,
        rawAgentId,
    } = input
    let teamSystemPrompt = ''
    let projectionAgentId = rawAgentId
    let projectionAgentName = request.agent.agentName

    if (request.teamId && request.teamThreadId) {
        try {
            const teamDef = await getTeamDefinitionForThread(workingDir, request.teamThreadId)
            if (teamDef) {
                const projection = projectTeamTools(
                    rawAgentId,
                    teamDef,
                    request.teamThreadId,
                    workingDir,
                )
                teamSystemPrompt = projection.systemPrompt

                const { resolveAgentForWake } = await import('../team-runtime/wake-agent-resolver.js')
                const resolvedAgent = await resolveAgentForWake(workingDir, teamDef, rawAgentId).catch(() => null)
                if (resolvedAgent?.agentId) {
                    projectionAgentId = resolvedAgent.agentId
                    projectionAgentName = resolvedAgent.agentName
                }
            }
        } catch (error) {
            console.warn('[chat-message-service] Team tool projection failed:', error)
        }
    }

    return {
        teamSystemPrompt,
        projectionAgentId,
        projectionAgentName,
    }
}
