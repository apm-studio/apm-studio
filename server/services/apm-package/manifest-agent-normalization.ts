import type {
    ApmAgentExtension,
    ApmPackageManifest,
} from '../../../shared/apm-contracts.js'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'
import type {
    WorkspaceAgentSnapshot,
    WorkspaceModelConfig,
    WorkspacePoint,
} from '../../../shared/workspace-contracts.js'
import { isRecord } from './yaml-io.js'

function agentBodyFromManifest(manifest: ApmPackageManifest): string | null {
    const agent = Array.isArray(manifest.agents) ? manifest.agents[0] : null
    if (isRecord(agent)) {
        const instruction = agent.instruction
        if (typeof instruction === 'string' && instruction.trim()) {
            return instruction
        }
        if (isRecord(instruction) && typeof instruction.content === 'string' && instruction.content.trim()) {
            return instruction.content
        }
    }

    return null
}

function agentBodyFromManifestSource(manifest: ApmPackageManifest): string | null {
    return agentBodyFromManifest(manifest)
}

function extensionAgentNodeId(extension: ApmAgentExtension) {
    return extension.agentNodeId || extension.agentName || 'agent'
}

function extensionAgentName(extension: ApmAgentExtension) {
    return extension.agentName || extensionAgentNodeId(extension)
}

function extensionAgentBody(extension: ApmAgentExtension, manifest?: ApmPackageManifest) {
    const body = extension.agentBody
    if (typeof body === 'string' && body.trim()) {
        return body
    }
    return manifest ? agentBodyFromManifestSource(manifest) : null
}

function extensionSkillRefs(extension: ApmAgentExtension) {
    return extension.skillRefs || []
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

function normalizePoint(value: unknown): WorkspacePoint | undefined {
    if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
        return undefined
    }
    return { x: value.x, y: value.y }
}

function normalizePositiveNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function normalizeBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined
}

function normalizeModel(value: unknown): WorkspaceModelConfig | null {
    if (
        !isRecord(value)
        || typeof value.provider !== 'string'
        || typeof value.modelId !== 'string'
        || !value.provider.trim()
        || !value.modelId.trim()
    ) {
        return null
    }
    return {
        provider: value.provider,
        modelId: value.modelId,
        ...(typeof value.temperature === 'number' && Number.isFinite(value.temperature) ? { temperature: value.temperature } : {}),
        ...(typeof value.maxTokens === 'number' && Number.isFinite(value.maxTokens) ? { maxTokens: value.maxTokens } : {}),
    }
}

function normalizePrimitiveRef(value: unknown): SharedPrimitiveRef | null {
    if (!isRecord(value)) return null
    if (value.kind === 'registry' && typeof value.urn === 'string' && value.urn.trim()) {
        return { kind: 'registry', urn: value.urn }
    }
    if (value.kind === 'draft' && typeof value.draftId === 'string' && value.draftId.trim()) {
        return { kind: 'draft', draftId: value.draftId }
    }
    return null
}

function normalizePrimitiveRefs(value: unknown): SharedPrimitiveRef[] {
    return Array.isArray(value)
        ? value.map(normalizePrimitiveRef).filter((entry): entry is SharedPrimitiveRef => entry !== null)
        : []
}

function normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
}

function normalizeStringMap(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined
    const entries = Object.entries(value).filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string'
        && entry[0].trim().length > 0
        && typeof entry[1] === 'string'
        && entry[1].trim().length > 0
    ))
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeRecord(value: unknown): Record<string, unknown> | null | undefined {
    if (value === null) return null
    return isRecord(value) ? value : undefined
}

function normalizeAgentMeta(value: unknown): WorkspaceAgentSnapshot['meta'] | undefined {
    if (!isRecord(value)) return undefined

    const derivedFrom = stringOrNull(value.derivedFrom)
    const sourceBindingUrn = stringOrNull(value.sourceBindingUrn)
    const authoring = isRecord(value.authoring)
        ? {
            ...(stringOrNull(value.authoring.slug) ? { slug: stringOrNull(value.authoring.slug) as string } : {}),
            ...(stringOrNull(value.authoring.description) ? { description: stringOrNull(value.authoring.description) as string } : {}),
            ...(normalizeStringArray(value.authoring.tags).length > 0 ? { tags: normalizeStringArray(value.authoring.tags) } : {}),
        }
        : undefined

    const meta = {
        ...(derivedFrom ? { derivedFrom } : {}),
        ...(sourceBindingUrn ? { sourceBindingUrn } : {}),
        ...(authoring && Object.keys(authoring).length > 0 ? { authoring } : {}),
    }
    return Object.keys(meta).length > 0 ? meta : undefined
}

export function normalizeAgent(value: unknown): WorkspaceAgentSnapshot | null {
    if (!isRecord(value)) return null
    if (typeof value.id !== 'string' || !value.id) return null
    if (typeof value.name !== 'string' || !value.name) return null

    const model = normalizeModel(value.model)
    const modelPlaceholder = normalizeRecord(value.modelPlaceholder) === null
        ? null
        : normalizeModel(value.modelPlaceholder)
    const declaredMcpConfig = normalizeRecord(value.declaredMcpConfig)
    const mcpBindingMap = normalizeStringMap(value.mcpBindingMap)
    const meta = normalizeAgentMeta(value.meta)

    const normalized: WorkspaceAgentSnapshot = {
        id: value.id,
        name: value.name,
        model,
        skillRefs: normalizePrimitiveRefs(value.skillRefs),
        agentBody: typeof value.agentBody === 'string' ? value.agentBody : null,
        mcpServerNames: normalizeStringArray(value.mcpServerNames),
    }

    const position = normalizePoint(value.position)
    if (position) normalized.position = position
    const width = normalizePositiveNumber(value.width)
    if (width !== undefined) normalized.width = width
    const height = normalizePositiveNumber(value.height)
    if (height !== undefined) normalized.height = height
    if (value.scope === 'shared') normalized.scope = 'shared'
    if (modelPlaceholder !== undefined) normalized.modelPlaceholder = modelPlaceholder
    const modelVariant = stringOrNull(value.modelVariant)
    normalized.modelVariant = modelVariant
    if (mcpBindingMap) normalized.mcpBindingMap = mcpBindingMap
    if (declaredMcpConfig !== undefined) normalized.declaredMcpConfig = declaredMcpConfig
    const runtimeAgentId = stringOrNull(value.runtimeAgentId)
    normalized.runtimeAgentId = runtimeAgentId
    const planMode = normalizeBoolean(value.planMode)
    if (planMode !== undefined) normalized.planMode = planMode
    const hidden = normalizeBoolean(value.hidden)
    if (hidden !== undefined) normalized.hidden = hidden
    if (meta) normalized.meta = meta

    return normalized
}

export function agentFromExtension(
    extension: ApmAgentExtension,
    manifest?: ApmPackageManifest,
): WorkspaceAgentSnapshot {
    const agentName = extensionAgentName(extension)
    const description = extension.description
        || (typeof manifest?.description === 'string' ? manifest.description : null)
        || null
    return {
        id: extensionAgentNodeId(extension),
        name: agentName,
        model: extension.model,
        modelVariant: extension.modelVariant || null,
        agentBody: extensionAgentBody(extension, manifest),
        skillRefs: extensionSkillRefs(extension),
        mcpServerNames: extension.mcpServerNames || [],
        runtimeAgentId: extension.runtimeAgentId || null,
        planMode: extension.planMode === true,
        meta: {
            ...(extension.derivedFrom ? { derivedFrom: extension.derivedFrom } : {}),
            ...(description ? { authoring: { description } } : {}),
        },
    }
}
