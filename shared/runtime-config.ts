import type { SharedPrimitiveRef } from './chat-contracts.js'
import { extractMcpServerNamesFromConfig } from './mcp-config.js'

export type SharedModelConfig = {
    provider: string
    modelId: string
}

export type AgentRuntimeConfigInput = {
    agentBody?: string | null
    skillRefs?: SharedPrimitiveRef[] | null
    model?: SharedModelConfig | null
    modelVariant?: string | null
    runtimeAgentId?: string | null
    mcpServerNames?: string[] | null
    mcpBindingMap?: Record<string, string> | null
    declaredMcpConfig?: Record<string, unknown> | null
    planMode?: boolean | null
}

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)))
}

function hashString(value: string): string {
    let h1 = 0xdeadbeef
    let h2 = 0x41c6ce57
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        h1 = Math.imul(h1 ^ code, 2654435761)
        h2 = Math.imul(h2 ^ code, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`
}

export function primitiveRefKey(ref: SharedPrimitiveRef | null | undefined): string | null {
    if (!ref) return null
    return ref.kind === 'registry' ? `registry:${ref.urn}` : `draft:${ref.draftId}`
}

export function primitiveRefKeys(refs: SharedPrimitiveRef[] | undefined | null): string[] {
    return (refs || [])
        .map((ref) => primitiveRefKey(ref))
        .filter((key): key is string => !!key)
}

export function resolveMappedMcpServerNames(
    agent: Pick<AgentRuntimeConfigInput, 'mcpServerNames' | 'mcpBindingMap'>,
) {
    return unique([
        ...(agent.mcpServerNames || []),
        ...Object.values(agent.mcpBindingMap || {}).filter(Boolean),
    ])
}

export function resolveAgentRuntimeId(
    agent: Pick<AgentRuntimeConfigInput, 'runtimeAgentId' | 'planMode'>,
): string {
    return agent.runtimeAgentId || (agent.planMode ? 'plan' : 'build')
}

export function resolveAgentRuntimeConfig(
    agent: AgentRuntimeConfigInput,
) {
    return {
        agentBody: typeof agent.agentBody === 'string' ? agent.agentBody : null,
        skillRefs: agent.skillRefs || [],
        model: agent.model || null,
        modelVariant: agent.modelVariant || null,
        runtimeAgentId: resolveAgentRuntimeId(agent),
        mcpServerNames: resolveMappedMcpServerNames(agent),
        planMode: !!agent.planMode,
    }
}

export function buildAgentConfigHash(
    agent: AgentRuntimeConfigInput,
): string {
    const normalized = {
        agentBody: typeof agent.agentBody === 'string' ? agent.agentBody : null,
        skillRefs: [...primitiveRefKeys(agent.skillRefs)].sort(),
        mcpServerNames: [...resolveMappedMcpServerNames(agent)].sort(),
        mcpBindingMap: Object.fromEntries(
            Object.entries(agent.mcpBindingMap || {})
                .filter(([, value]) => !!value)
                .sort(([left], [right]) => left.localeCompare(right)),
        ),
        declaredMcpServerNames: extractMcpServerNamesFromConfig(agent.declaredMcpConfig),
        model: agent.model ? {
            provider: agent.model.provider,
            modelId: agent.model.modelId,
        } : null,
        modelVariant: agent.modelVariant || null,
        runtimeAgentId: resolveAgentRuntimeId(agent),
    }
    return `cfg_${hashString(JSON.stringify(normalized))}`
}
