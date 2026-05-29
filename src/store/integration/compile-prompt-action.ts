import type { StudioState } from '../types'
import { compileApi } from '../../api-clients/compile'
import { formatStudioApiErrorComment } from '../../lib/api-errors'
import {
    hasModelConfig,
    resolveAgentRuntimeConfig,
} from '../../lib/agents'

export function createCompilePromptAction(get: () => StudioState) {
    return async (agentId: string) => {
        const agent = get().agents.find((entry) => entry.id === agentId)
        if (!agent) return '// No agent selected'
        const runtimeConfig = resolveAgentRuntimeConfig(agent)
        if (!hasModelConfig(runtimeConfig.model)) {
            return '// Prompt preview unavailable.'
        }
        try {
            // Standalone agents pass no extra request targets by default.
            const requestTargets: Array<{ agentId: string; agentName: string; description: string }> = []
            const res = await compileApi.compile(
                agent.id,
                agent.name,
                runtimeConfig.instructionRef,
                runtimeConfig.skillRefs,
                runtimeConfig.model,
                runtimeConfig.modelVariant,
                runtimeConfig.runtimeAgentId,
                runtimeConfig.mcpServerNames,
                runtimeConfig.planMode,
                requestTargets,
            )
            const lines = [
                `// OpenCode Agent: ${res.agent}`,
            ]

            if (runtimeConfig.modelVariant) {
                lines.push(`// Model Variant: ${runtimeConfig.modelVariant}`)
            }

            if (res.capabilitySnapshot) {
                lines.push(
                    `// Model Capabilities: tools=${res.capabilitySnapshot.toolCall ? 'yes' : 'no'}, attachments=${res.capabilitySnapshot.attachment ? 'yes' : 'no'}, reasoning=${res.capabilitySnapshot.reasoning ? 'yes' : 'no'}`,
                )
            }

            if (res.toolName) {
                lines.push(`// Capability Loader Tool: ${res.toolName}`)
            }

            if (res.instructionStack?.length) {
                lines.push('', '// Instruction Stack')
                for (const [index, layer] of res.instructionStack.entries()) {
                    lines.push(`// ${index + 1}. ${layer.label}: ${layer.detail}`)
                }
            }

            if (res.skillCatalog.length > 0) {
                lines.push('', '// Skill Catalog')
                for (const skill of res.skillCatalog) {
                    lines.push(`- ${skill.urn} (${skill.loadMode})${skill.description ? `: ${skill.description}` : ''}`)
                }
            }

            if (res.toolResolution && res.toolResolution.selectedMcpServers.length > 0) {
                lines.push('', `// Selected MCP Servers: ${res.toolResolution.selectedMcpServers.join(', ')}`)
            }

            if (res.toolResolution && res.toolResolution.resolvedTools.length > 0) {
                lines.push('', '// Enabled MCP Tool Globs')
                for (const toolPattern of res.toolResolution.resolvedTools) {
                    lines.push(`- ${toolPattern}`)
                }
            }

            if (res.toolResolution && res.toolResolution.unavailableTools.length > 0) {
                lines.push('', '// Unavailable MCP Tool Globs')
                for (const toolPattern of res.toolResolution.unavailableTools) {
                    lines.push(`- ${toolPattern}`)
                }
            }

            if (res.toolResolution && res.toolResolution.unavailableDetails.length > 0) {
                lines.push('', '// MCP Availability')
                for (const detail of res.toolResolution.unavailableDetails) {
                    lines.push(`- ${detail.serverName}: ${detail.reason}${detail.toolId ? ` (${detail.toolId})` : ''}${detail.detail ? ` — ${detail.detail}` : ''}`)
                }
            }

            lines.push('', res.system)
            return lines.join('\n')
        } catch (err) {
            return formatStudioApiErrorComment(err)
        }
    }
}
