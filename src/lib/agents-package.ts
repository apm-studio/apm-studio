import type { PrimitiveCard, DraftPrimitive } from './primitive-types'
import type { SharedPrimitiveRef } from '../../shared/chat-contracts'
import { extractMcpServerNamesFromConfig } from '../../shared/mcp-config'
import type { McpServerSummary } from '../../shared/opencode-contracts'
import type { WorkspaceModelConfig,
    WorkspaceAgentNode,
    WorkspaceTeamSnapshot,
} from '../../shared/workspace-contracts'
import { primitiveUrnAuthor, primitiveUrnDisplayName, parseStudioPrimitiveUrn } from './primitive-urn'

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)))
}

export function slugifyPrimitiveName(value: string): string {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-._]+|[-._]+$/g, '')

    if (!normalized) return 'untitled-primitive'
    if (normalized.length === 1) return `${normalized}${normalized}`
    return normalized.slice(0, 100)
}

export function registryPrimitiveRef(urn: string | null | undefined): SharedPrimitiveRef | null {
    if (!urn || !urn.trim()) return null
    return { kind: 'registry', urn: urn.trim() }
}

export function registryPrimitiveRefs(urns: string[] | undefined | null): SharedPrimitiveRef[] {
    return (urns || [])
        .map((urn) => registryPrimitiveRef(urn))
        .filter((ref): ref is SharedPrimitiveRef => ref !== null)
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

export function isSamePrimitiveRef(left: SharedPrimitiveRef | null | undefined, right: SharedPrimitiveRef | null | undefined): boolean {
    return primitiveRefKey(left) === primitiveRefKey(right)
}

export function registryUrnFromRef(ref: SharedPrimitiveRef | null | undefined): string | null {
    if (!ref || ref.kind !== 'registry') return null
    return ref.urn
}

export function registryUrnsFromRefs(refs: SharedPrimitiveRef[] | undefined | null): string[] {
    return (refs || [])
        .map((ref) => registryUrnFromRef(ref))
        .filter((urn): urn is string => !!urn)
}

export function getAgentDependencyPackageIssues(
    agent: Pick<WorkspaceAgentNode, 'instructionRef' | 'skillRefs'>,
): string[] {
    const issues: string[] = []

    if (agent.instructionRef?.kind === 'draft') {
        issues.push('Instruction is still attached as a draft. Save the instruction locally, then re-apply it before saving this agent.')
    }

    if ((agent.skillRefs || []).some((ref) => ref.kind === 'draft')) {
        issues.push('Draft Skills are still attached. Save them as local Skill packages, then re-apply them from Packages before saving this agent package.')
    }

    return issues
}

function declaredMcpServerNames(declaredMcpConfig: Record<string, unknown> | null | undefined) {
    return extractMcpServerNamesFromConfig(declaredMcpConfig)
}

function sanitizeMcpBindingMap(mcpBindingMap: Record<string, string> | null | undefined) {
    return Object.fromEntries(
        Object.entries(mcpBindingMap || {}).filter(([placeholderName, serverName]) => !!placeholderName && !!serverName),
    )
}

export function buildAutoMcpBindingMap(
    declaredMcpConfig: Record<string, unknown> | null | undefined,
    availableServerNames: string[],
) {
    const allowed = new Set(availableServerNames.filter(Boolean))
    return Object.fromEntries(
        extractMcpServerNamesFromConfig(declaredMcpConfig)
            .filter((name) => allowed.has(name))
            .map((name) => [name, name]),
    )
}

export function resolveMappedMcpServerNames(
    agent: Pick<WorkspaceAgentNode, 'mcpServerNames' | 'mcpBindingMap'>,
) {
    return unique([
        ...(agent.mcpServerNames || []),
        ...Object.values(agent.mcpBindingMap || {}).filter(Boolean),
    ])
}

export function unresolvedDeclaredMcpServerNames(
    agent: Pick<WorkspaceAgentNode, 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
): string[] {
    const declaredNames = declaredMcpServerNames(agent.declaredMcpConfig)
    const bindings = agent.mcpBindingMap || {}
    const selected = new Set(agent.mcpServerNames || [])
    return declaredNames.filter((name) => {
        const mapped = bindings[name]
        if (mapped && mapped.trim()) return false
        return !selected.has(name)
    })
}

export function agentMcpConfigForPrimitive(
    agent: Pick<WorkspaceAgentNode, 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
): Record<string, unknown> | undefined {
    const serverNames = resolveMappedMcpServerNames(agent)
    if (agent.declaredMcpConfig && typeof agent.declaredMcpConfig === 'object') {
        return agent.declaredMcpConfig
    }
    if (serverNames.length === 0) return undefined
    return { servers: serverNames }
}

function modelConfigFromPrimitiveValue(value: unknown): WorkspaceModelConfig | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    if (!normalized) return null
    const slashIndex = normalized.indexOf('/')
    const colonIndex = normalized.indexOf(':')
    const separatorIndex = slashIndex > 0 ? slashIndex : colonIndex > 0 ? colonIndex : -1
    if (separatorIndex === -1) return null
    const provider = normalized.slice(0, separatorIndex).trim()
    const modelId = normalized.slice(separatorIndex + 1).trim()
    if (!provider || !modelId) return null
    return { provider, modelId }
}

function normalizeModelValue(model: WorkspaceModelConfig | string | null | undefined) {
    return typeof model === 'object' && model ? model : modelConfigFromPrimitiveValue(model)
}

export function buildAgentPrimitivePayload(
    agent: Pick<WorkspaceAgentNode, 'instructionRef' | 'skillRefs' | 'model' | 'modelVariant' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
    options: {
        name: string
        description?: string
        tags?: string[]
    },
) {
    const instructionUrn = registryUrnFromRef(agent.instructionRef)
    const skillUrns = registryUrnsFromRefs(agent.skillRefs)
    const unresolvedRefs = [
        ...(agent.instructionRef && !instructionUrn ? [agent.instructionRef] : []),
        ...(agent.skillRefs || []).filter((ref) => ref.kind !== 'registry'),
    ]

    if (unresolvedRefs.length > 0) {
        const dependencyIssues = getAgentDependencyPackageIssues(agent)
        if (dependencyIssues.length > 0) {
            throw new Error(dependencyIssues.join(' '))
        }
        throw new Error('Agent primitives require installable Instruction and Skill references. Reconnect them from Packages before saving this agent package.')
    }
    if (!instructionUrn && skillUrns.length === 0) {
        throw new Error('An agent package requires at least one Instruction or Skill reference.')
    }

    const mcpConfig = agentMcpConfigForPrimitive(agent)

    const description = options.description?.trim() || options.name.trim()
    const tags = (options.tags || []).filter((tag) => tag.trim().length > 0)

    return {
        kind: 'agent' as const,
        urn: `agent/@pending/${slugifyPrimitiveName(options.name.trim() || 'untitled-agent')}`,
        description,
        tags,
        payload: {
            ...(instructionUrn ? { instruction: instructionUrn } : {}),
            ...(skillUrns.length > 0 ? { skills: skillUrns } : {}),
            ...(agent.model ? { model: { provider: agent.model.provider, modelId: agent.model.modelId } } : {}),
            ...(agent.modelVariant ? { modelVariant: agent.modelVariant } : {}),
            ...(mcpConfig && Object.keys(mcpConfig).length > 0 ? { mcp_config: mcpConfig } : {}),
        },
    }
}

export function buildTeamPrimitivePayload(
    team: WorkspaceTeamSnapshot,
    options: { description?: string; tags?: string[] } = {},
) {
    const displayNameByKey = Object.fromEntries(
        Object.entries(team.participants).map(([key, binding]) => [key, binding.displayName?.trim() || key]),
    )
    const exportedKeys = Object.values(displayNameByKey)
    if (new Set(exportedKeys).size !== exportedKeys.length) {
        throw new Error('Participant display names must be unique before saving this team primitive.')
    }

    const participants = Object.entries(team.participants).map(([key, binding]) => ({
        key: displayNameByKey[key] || key,
        agentRef: binding.agentRef,
        subscriptions: binding.subscriptions
            ? {
                ...binding.subscriptions,
                ...(binding.subscriptions.messagesFrom
                    ? {
                        messagesFrom: binding.subscriptions.messagesFrom.map((entry) => displayNameByKey[entry] || entry),
                    }
                    : {}),
            }
            : undefined,
    }))

    const unresolvedParticipants = participants.filter((participant) => participant.agentRef.kind !== 'registry')
    if (unresolvedParticipants.length > 0) {
        throw new Error('Save participant agent drafts as local packages before authoring this team package.')
    }

    const invalidRelation = team.relations.find((relation) => !relation.description || !relation.description.trim())
    if (invalidRelation) {
        throw new Error(`Relation "${invalidRelation.name}" requires a description before saving this team package.`)
    }

    const relations = team.relations.map((relation) => ({
        between: relation.between.map((entry) => displayNameByKey[entry] || entry) as [string, string],
        direction: relation.direction,
        name: relation.name,
        description: relation.description,
    }))

    return {
        kind: 'team' as const,
        urn: `team/@pending/${slugifyPrimitiveName(team.name || 'untitled-team')}`,
        description: options.description?.trim() || team.description || team.name,
        tags: (options.tags || []).filter((tag) => tag.trim().length > 0),
        payload: {
            ...(team.teamRules && team.teamRules.length > 0 ? { teamRules: team.teamRules } : {}),
            participants: participants.map((participant) => ({
                key: participant.key,
                agent: participant.agentRef.kind === 'registry' ? participant.agentRef.urn : '',
                ...(participant.subscriptions ? { subscriptions: participant.subscriptions } : {}),
            })),
            relations,
        },
    }
}

function parseUrn(urn: string): PrimitiveCard {
    const parsed = parseStudioPrimitiveUrn(urn)
    return {
        kind: (parsed?.kind || urn.split('/')[0]) as PrimitiveCard['kind'],
        urn,
        name: primitiveUrnDisplayName(urn),
        author: primitiveUrnAuthor(urn) || '@unknown',
        description: '',
    }
}

function draftPrimitiveCardFromRef(ref: SharedPrimitiveRef, draftMap: Record<string, DraftPrimitive>): PrimitiveCard | null {
    if (ref.kind !== 'draft') return null
    const draft = draftMap[ref.draftId]
    if (!draft) {
        return {
            kind: 'instruction',
            urn: `draft/${ref.draftId}`,
            name: ref.draftId,
            author: '@draft',
            description: 'Missing draft primitive',
        }
    }
    return {
        kind: draft.kind as PrimitiveCard['kind'],
        urn: `draft/${draft.id}`,
        name: draft.name,
        author: '@draft',
        description: draft.description,
        source: 'workspace',
    }
}

export function normalizeAgentPrimitiveInput(primitive: {
    name: string
    urn?: string | null
    instructionUrn?: string | null
    skillUrns?: string[]
    model?: WorkspaceModelConfig | string | null
    modelVariant?: string | null
    modelPlaceholder?: WorkspaceModelConfig | null
    agentBody?: string | null
    runtimeAgentId?: string | null
    planMode?: boolean
    mcpServerNames?: string[]
    mcpBindingMap?: Record<string, string>
    mcpConfig?: Record<string, unknown> | null
    description?: string
}) {
    const declaredMcpConfig = primitive.mcpConfig && typeof primitive.mcpConfig === 'object'
        ? primitive.mcpConfig
        : null
    const normalizedMcpServerNames = unique(primitive.mcpServerNames || extractMcpServerNamesFromConfig(declaredMcpConfig))
    const autoBindingMap = buildAutoMcpBindingMap(declaredMcpConfig, normalizedMcpServerNames)
    const directMcpServerNames = normalizedMcpServerNames.filter((name) => !(name in autoBindingMap))
    const authoringDescription = typeof primitive.description === 'string' && primitive.description.trim()
        ? primitive.description.trim()
        : null
    const meta = {
        ...(primitive.urn ? { derivedFrom: primitive.urn, sourceBindingUrn: primitive.urn } : {}),
        ...(authoringDescription ? { authoring: { description: authoringDescription } } : {}),
    }

    return {
        name: primitive.name,
        instructionRef: registryPrimitiveRef(primitive.instructionUrn),
        skillRefs: registryPrimitiveRefs(primitive.skillUrns),
        model: normalizeModelValue(primitive.model),
        modelVariant: primitive.modelVariant || null,
        modelPlaceholder: primitive.modelPlaceholder || null,
        agentBody: typeof primitive.agentBody === 'string' ? primitive.agentBody : null,
        runtimeAgentId: primitive.runtimeAgentId || null,
        planMode: primitive.planMode === true,
        mcpServerNames: directMcpServerNames,
        mcpBindingMap: {
            ...autoBindingMap,
            ...(primitive.mcpBindingMap || {}),
        },
        declaredMcpConfig,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
    }
}

export function primitiveCardFromUrn(urn: string | null): PrimitiveCard | null {
    if (!urn) return null
    return parseUrn(urn)
}

export function buildPrimitiveCardMap(primitives: PrimitiveCard[]): Record<string, PrimitiveCard> {
    return primitives.reduce<Record<string, PrimitiveCard>>((acc, primitive) => {
        acc[primitive.urn] = primitive
        return acc
    }, {})
}

export function buildMcpServerMap(servers: McpServerSummary[]): Record<string, McpServerSummary> {
    return servers.reduce<Record<string, McpServerSummary>>((acc, server) => {
        acc[server.name] = server
        return acc
    }, {})
}

function resolvePrimitiveCard(
    ref: SharedPrimitiveRef | null | undefined,
    primitiveMap: Record<string, PrimitiveCard>,
    draftMap: Record<string, DraftPrimitive>,
): PrimitiveCard | null {
    if (!ref) return null
    if (ref.kind === 'registry') {
        return primitiveMap[ref.urn] || parseUrn(ref.urn)
    }
    return draftPrimitiveCardFromRef(ref, draftMap)
}

export function resolveAgentPresentation(
    agent: Pick<WorkspaceAgentNode, 'instructionRef' | 'skillRefs' | 'mcpServerNames' | 'mcpBindingMap' | 'declaredMcpConfig'>,
    primitiveMap: Record<string, PrimitiveCard>,
    mcpMap: Record<string, McpServerSummary>,
    draftMap: Record<string, DraftPrimitive> = {},
) {
    const declaredMcpNames = extractMcpServerNamesFromConfig(agent.declaredMcpConfig)
    return {
        instructionPrimitive: resolvePrimitiveCard(agent.instructionRef, primitiveMap, draftMap),
        skillPrimitives: (agent.skillRefs || [])
            .map((ref) => resolvePrimitiveCard(ref, primitiveMap, draftMap))
            .filter((primitive): primitive is PrimitiveCard => primitive !== null),
        mcpServers: resolveMappedMcpServerNames(agent).map((name) => (
            mcpMap[name] || { name, status: 'unknown', tools: [], resources: [] }
        )),
        mcpPlaceholders: unresolvedDeclaredMcpServerNames(agent),
        mappedMcpPlaceholders: Object.entries(agent.mcpBindingMap || {})
            .filter(([placeholderName, serverName]) => (
                !!placeholderName
                && !!serverName
                && declaredMcpNames.includes(placeholderName)
            ))
            .map(([placeholderName, serverName]) => ({
                placeholderName,
                serverName,
                server: mcpMap[serverName] || null,
            })),
        declaredMcpServerNames: declaredMcpNames,
    }
}

export { sanitizeMcpBindingMap }
