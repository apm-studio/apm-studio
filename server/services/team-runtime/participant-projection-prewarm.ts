import type { TeamDefinition } from '../../../shared/team-types.js'
import { ensureAgentProjection } from '../opencode-projection/workspace-agent-projection-service.js'
import { ensureTeamToolFiles } from './team-tool-files.js'
import { resolveAgentForWake } from './wake-agent-resolver.js'

export async function prewarmTeamParticipantProjections(params: {
    workingDir: string
    teamDefinition?: TeamDefinition
}): Promise<void> {
    const { workingDir, teamDefinition } = params
    if (!teamDefinition) {
        return
    }

    for (const participantKey of Object.keys(teamDefinition.participants || {})) {
        try {
            const agentConfig = await resolveAgentForWake(
                workingDir,
                teamDefinition,
                participantKey,
            )
            if (!agentConfig?.model) {
                continue
            }

            await ensureAgentProjection({
                agentId: agentConfig.agentId,
                agentName: agentConfig.agentName,
                skillRefs: agentConfig.skillRefs,
                model: agentConfig.model,
                modelVariant: agentConfig.modelVariant,
                mcpServerNames: agentConfig.mcpServerNames,
                workingDir,
            })
            await ensureTeamToolFiles(workingDir, workingDir)
        } catch (error) {
            console.warn(
                `[team-runtime] Failed to prewarm projection for "${participantKey}" in team "${teamDefinition.id}": ${errorMessage(error)}`,
            )
        }
    }
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}
