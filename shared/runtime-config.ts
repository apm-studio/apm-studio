import type { SharedAssetRef } from './chat-contracts.js'
import { extractMcpServerNamesFromConfig } from './mcp-config.js'

export type SharedModelConfig = {
    provider: string
    modelId: string
}

export type PerformerRuntimeConfigInput = {
    talRef?: SharedAssetRef | null
    inlineInstruction?: string | null
    danceRefs?: SharedAssetRef[] | null
    model?: SharedModelConfig | null
    modelVariant?: string | null
    agentId?: string | null
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

export function assetRefKey(ref: SharedAssetRef | null | undefined): string | null {
    if (!ref) return null
    return ref.kind === 'registry' ? `registry:${ref.urn}` : `draft:${ref.draftId}`
}

export function assetRefKeys(refs: SharedAssetRef[] | undefined | null): string[] {
    return (refs || [])
        .map((ref) => assetRefKey(ref))
        .filter((key): key is string => !!key)
}

export function resolveMappedMcpServerNames(
    performer: Pick<PerformerRuntimeConfigInput, 'mcpServerNames' | 'mcpBindingMap'>,
) {
    return unique([
        ...(performer.mcpServerNames || []),
        ...Object.values(performer.mcpBindingMap || {}).filter(Boolean),
    ])
}

export function resolvePerformerAgentId(
    performer: Pick<PerformerRuntimeConfigInput, 'agentId' | 'planMode'>,
): string {
    return performer.agentId || (performer.planMode ? 'plan' : 'build')
}

export function resolvePerformerRuntimeConfig(
    performer: PerformerRuntimeConfigInput,
) {
    return {
        talRef: performer.talRef || null,
        inlineInstruction: typeof performer.inlineInstruction === 'string' ? performer.inlineInstruction : null,
        danceRefs: performer.danceRefs || [],
        model: performer.model || null,
        modelVariant: performer.modelVariant || null,
        agentId: resolvePerformerAgentId(performer),
        mcpServerNames: resolveMappedMcpServerNames(performer),
        planMode: !!performer.planMode,
    }
}

export function buildPerformerConfigHash(
    performer: PerformerRuntimeConfigInput,
): string {
    const normalized = {
        talRef: assetRefKey(performer.talRef),
        inlineInstruction: typeof performer.inlineInstruction === 'string' ? performer.inlineInstruction : null,
        danceRefs: [...assetRefKeys(performer.danceRefs)].sort(),
        mcpServerNames: [...resolveMappedMcpServerNames(performer)].sort(),
        mcpBindingMap: Object.fromEntries(
            Object.entries(performer.mcpBindingMap || {})
                .filter(([, value]) => !!value)
                .sort(([left], [right]) => left.localeCompare(right)),
        ),
        declaredMcpServerNames: extractMcpServerNamesFromConfig(performer.declaredMcpConfig),
        model: performer.model ? {
            provider: performer.model.provider,
            modelId: performer.model.modelId,
        } : null,
        modelVariant: performer.modelVariant || null,
        agentId: resolvePerformerAgentId(performer),
    }
    return `cfg_${hashString(JSON.stringify(normalized))}`
}
