import { extractMcpServerNamesFromConfig } from '../shared/mcp-config'
import { resolveAgentMcpPortability } from '../shared/agent-mcp-portability'
import { loadAgentImportContext, normalizeImportedAgentPrimitive } from './lib/agent-import'
import { showToast } from './lib/toast'
import type { AgentPrimitivePayload, DragPrimitive } from './lib/dnd-handlers'

type McpConfigEntryLike = {
    command?: string | string[]
    url?: string
}

export async function resolveAgentPrimitiveForStudio(
    primitive: DragPrimitive,
    showDropWarning: (message: string) => void,
): Promise<AgentPrimitivePayload> {
    const context = await loadAgentImportContext()
    const normalized = normalizeImportedAgentPrimitive(primitive, context)
    if (!normalized.model && normalized.modelPlaceholder) {
        showDropWarning(`Model ${normalized.modelPlaceholder.provider}/${normalized.modelPlaceholder.modelId} is not available in this Studio runtime. A placeholder was kept so you can pick a replacement.`)
    }
    const portability = (
        Array.isArray(primitive.declaredMcpServerNames)
        && Array.isArray(primitive.matchedMcpServerNames)
        && Array.isArray(primitive.missingMcpServerNames)
    )
        ? {
            declaredMcpServerNames: primitive.declaredMcpServerNames,
            matchedMcpServerNames: primitive.matchedMcpServerNames,
            missingMcpServerNames: primitive.missingMcpServerNames,
        }
        : resolveAgentMcpPortability(primitive.mcpConfig, context.availableMcpServerNames)

    const declaredMcpNames = portability.declaredMcpServerNames.length > 0
        ? portability.declaredMcpServerNames
        : extractMcpServerNamesFromConfig(primitive.mcpConfig)
    const unresolvedMcpNames = declaredMcpNames.filter((name) => !(normalized.mcpBindingMap?.[name] || '').trim())

    if (portability.matchedMcpServerNames.length > 0) {
        showToast(
            `Imported agent found matching Studio MCP names: ${portability.matchedMcpServerNames.join(', ')}. Review the agent binding after import.`,
            'info',
            {
                title: 'Matching MCP names found',
                dedupeKey: `agent-import-mcp-match:${primitive.urn || primitive.name}:${portability.matchedMcpServerNames.join(',')}`,
                durationMs: 5000,
            },
        )
    }
    if (unresolvedMcpNames.length > 0) {
        const mcpConfig = (primitive.mcpConfig && typeof primitive.mcpConfig === 'object')
            ? primitive.mcpConfig as Record<string, McpConfigEntryLike>
            : {}
        const details = unresolvedMcpNames.map((name) => {
            const cfg = mcpConfig[name]
            if (cfg && cfg.command) {
                const cmd = Array.isArray(cfg.command) ? cfg.command.join(' ') : String(cfg.command)
                return `• ${name} (local: ${cmd})`
            }
            if (cfg && cfg.url) {
                return `• ${name} (remote: ${cfg.url})`
            }
            return `• ${name}`
        }).join('\n')
        showToast(
            `This agent requires MCP servers that are not yet in the Studio MCP library:\n${details}\n\nAdd them in Packages → MCP.`,
            'warning',
            {
                title: 'MCP servers required',
                dedupeKey: `agent-import-mcp-missing:${primitive.urn || primitive.name}`,
                durationMs: 8000,
            },
        )
    }
    return normalized as AgentPrimitivePayload
}
