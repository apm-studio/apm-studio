import { extractMcpServerNamesFromConfig } from './mcp-config.js'

export type AgentMcpPortability = {
    declaredMcpServerNames: string[]
    matchedMcpServerNames: string[]
    missingMcpServerNames: string[]
}

export function resolveAgentMcpPortability(
    mcpConfig: unknown,
    availableMcpServerNames: string[],
): AgentMcpPortability {
    const declaredMcpServerNames = extractMcpServerNamesFromConfig(mcpConfig)
    const available = new Set(availableMcpServerNames.filter(Boolean))

    return {
        declaredMcpServerNames,
        matchedMcpServerNames: declaredMcpServerNames.filter((name) => available.has(name)),
        missingMcpServerNames: declaredMcpServerNames.filter((name) => !available.has(name)),
    }
}
