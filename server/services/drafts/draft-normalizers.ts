import { StudioValidationError } from '../../lib/opencode-errors.js'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'
import type {
    AgentDraftContent,
    DraftContent,
    DraftContentMap,
    DraftFile,
    DraftKind,
    TeamDraftContent,
    TypedDraftFile,
} from '../../../shared/draft-contracts.js'
import type { TeamRelation } from '../../../shared/team-types.js'
import type {
    WorkspaceModelConfig,
    WorkspacePoint,
    WorkspaceTeamMetadata,
} from '../../../shared/workspace-contracts.js'

export const DRAFT_KINDS: readonly DraftKind[] = ['instruction', 'skill', 'agent', 'team'] as const
const DRAFT_KIND_SET = new Set<DraftKind>(DRAFT_KINDS)

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrUndefined(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

function stringOrNullOrUndefined(value: unknown): string | null | undefined {
    return value === null || typeof value === 'string' ? value : undefined
}

function booleanOrUndefined(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined
}

function numberOrUndefined(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeStringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) {
        throw new Error(`${field} must be an array of strings.`)
    }
    return value.map((entry) => {
        if (typeof entry !== 'string') {
            throw new Error(`${field} must be an array of strings.`)
        }
        return entry
    })
}

function normalizeOptionalStringArray(value: unknown, field: string): string[] | undefined {
    return value === undefined ? undefined : normalizeStringArray(value, field)
}

function normalizeStringRecord(value: unknown, field: string): Record<string, string> {
    if (!isRecord(value)) {
        throw new Error(`${field} must be an object with string values.`)
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => {
            if (typeof entry !== 'string') {
                throw new Error(`${field} must be an object with string values.`)
            }
            return [key, entry]
        }),
    )
}

function normalizeOptionalPoint(value: unknown, field: string): WorkspacePoint | undefined {
    if (value === undefined) return undefined
    if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
        throw new Error(`${field} must be a point with x and y numbers.`)
    }
    return { x: value.x, y: value.y }
}

function normalizePrimitiveRef(value: unknown, field: string): SharedPrimitiveRef {
    if (!isRecord(value)) {
        throw new Error(`${field} must be a primitive reference.`)
    }
    if (value.kind === 'registry' && typeof value.urn === 'string') {
        return { kind: 'registry', urn: value.urn }
    }
    if (value.kind === 'draft' && typeof value.draftId === 'string') {
        return { kind: 'draft', draftId: value.draftId }
    }
    throw new Error(`${field} must be a registry or draft primitive reference.`)
}

function normalizeModel(value: unknown, field: string): WorkspaceModelConfig | null {
    if (value === null) return null
    if (!isRecord(value) || typeof value.provider !== 'string' || typeof value.modelId !== 'string') {
        throw new Error(`${field} must be null or a model object.`)
    }
    const temperature = numberOrUndefined(value.temperature)
    const maxTokens = numberOrUndefined(value.maxTokens)
    return {
        provider: value.provider,
        modelId: value.modelId,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(maxTokens !== undefined ? { maxTokens } : {}),
    }
}

function normalizeAgentDraftContent(value: unknown): AgentDraftContent {
    if (!isRecord(value)) {
        throw new Error('Agent draft content must be an object.')
    }
    if (!Array.isArray(value.skillRefs)) {
        throw new Error('Agent draft content requires skillRefs.')
    }
    if (!Array.isArray(value.mcpServerNames)) {
        throw new Error('Agent draft content requires mcpServerNames.')
    }

    const instructionRef = value.instructionRef === null
        ? null
        : normalizePrimitiveRef(value.instructionRef, 'Agent draft instructionRef')
    const agentBody = stringOrNullOrUndefined(value.agentBody)
    const modelVariant = stringOrNullOrUndefined(value.modelVariant)
    const runtimeAgentId = stringOrNullOrUndefined(value.runtimeAgentId)
    const mcpBindingMap = value.mcpBindingMap === undefined
        ? undefined
        : normalizeStringRecord(value.mcpBindingMap, 'Agent draft mcpBindingMap')
    const planMode = booleanOrUndefined(value.planMode)

    return {
        instructionRef,
        ...(agentBody !== undefined ? { agentBody } : {}),
        skillRefs: value.skillRefs.map((entry, index) => normalizePrimitiveRef(entry, `Agent draft skillRefs[${index}]`)),
        model: normalizeModel(value.model, 'Agent draft model'),
        ...(modelVariant !== undefined ? { modelVariant } : {}),
        mcpServerNames: normalizeStringArray(value.mcpServerNames, 'Agent draft mcpServerNames'),
        ...(mcpBindingMap !== undefined ? { mcpBindingMap } : {}),
        ...(planMode !== undefined ? { planMode } : {}),
        ...(runtimeAgentId !== undefined ? { runtimeAgentId } : {}),
    }
}

function normalizeParticipantSubscriptions(value: unknown, field: string): TeamDraftContent['participants'][string]['subscriptions'] | undefined {
    if (value === undefined) return undefined
    if (!isRecord(value)) {
        throw new Error(`${field} must be an object.`)
    }
    const messagesFrom = normalizeOptionalStringArray(value.messagesFrom, `${field}.messagesFrom`)
    const messageTags = normalizeOptionalStringArray(value.messageTags, `${field}.messageTags`)
    const callboardKeys = normalizeOptionalStringArray(value.callboardKeys, `${field}.callboardKeys`)
    const eventTypes = normalizeOptionalStringArray(value.eventTypes, `${field}.eventTypes`)
    if (eventTypes?.some((entry) => entry !== 'runtime.idle')) {
        throw new Error(`${field}.eventTypes only supports runtime.idle.`)
    }
    return {
        ...(messagesFrom !== undefined ? { messagesFrom } : {}),
        ...(messageTags !== undefined ? { messageTags } : {}),
        ...(callboardKeys !== undefined ? { callboardKeys } : {}),
        ...(eventTypes !== undefined ? { eventTypes: eventTypes as Array<'runtime.idle'> } : {}),
    }
}

function normalizeTeamParticipantBinding(value: unknown, field: string): TeamDraftContent['participants'][string] {
    if (!isRecord(value)) {
        throw new Error(`${field} must be an object.`)
    }
    const displayName = stringOrUndefined(value.displayName)
    const subscriptions = normalizeParticipantSubscriptions(value.subscriptions, `${field}.subscriptions`)
    const position = normalizeOptionalPoint(value.position, `${field}.position`)
    return {
        agentRef: normalizePrimitiveRef(value.agentRef, `${field}.agentRef`),
        ...(displayName !== undefined ? { displayName } : {}),
        ...(subscriptions !== undefined ? { subscriptions } : {}),
        ...(position !== undefined ? { position } : {}),
    }
}

function normalizeTeamRelation(value: unknown, field: string): TeamRelation {
    if (!isRecord(value)) {
        throw new Error(`${field} must be an object.`)
    }
    if (!Array.isArray(value.between) || value.between.length !== 2 || value.between.some((entry) => typeof entry !== 'string')) {
        throw new Error(`${field}.between must contain two participant keys.`)
    }
    if (value.direction !== 'both' && value.direction !== 'one-way') {
        throw new Error(`${field}.direction must be both or one-way.`)
    }
    if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.description !== 'string') {
        throw new Error(`${field} requires id, name, and description.`)
    }
    return {
        id: value.id,
        between: [value.between[0], value.between[1]],
        direction: value.direction,
        name: value.name,
        description: value.description,
    }
}

function normalizeTeamMetadata(value: unknown, field: string): WorkspaceTeamMetadata | undefined {
    if (value === undefined) return undefined
    if (!isRecord(value)) {
        throw new Error(`${field} must be an object.`)
    }
    const derivedFrom = stringOrNullOrUndefined(value.derivedFrom)
    const authoring = value.authoring
    if (authoring !== undefined && !isRecord(authoring)) {
        throw new Error(`${field}.authoring must be an object.`)
    }
    if (!isRecord(authoring)) {
        return {
            ...(derivedFrom !== undefined ? { derivedFrom } : {}),
        }
    }
    const tags = normalizeOptionalStringArray(authoring.tags, `${field}.authoring.tags`)
    return {
        ...(derivedFrom !== undefined ? { derivedFrom } : {}),
        authoring: {
            ...(stringOrUndefined(authoring.slug) !== undefined ? { slug: stringOrUndefined(authoring.slug) } : {}),
            ...(stringOrUndefined(authoring.description) !== undefined ? { description: stringOrUndefined(authoring.description) } : {}),
            ...(tags !== undefined ? { tags } : {}),
        },
    }
}

function normalizeTeamSafety(value: unknown, field: string): TeamDraftContent['safety'] | undefined {
    if (value === undefined) return undefined
    if (!isRecord(value)) {
        throw new Error(`${field} must be an object.`)
    }
    return {
        ...(numberOrUndefined(value.maxEvents) !== undefined ? { maxEvents: numberOrUndefined(value.maxEvents) } : {}),
        ...(numberOrUndefined(value.maxMessagesPerPair) !== undefined ? { maxMessagesPerPair: numberOrUndefined(value.maxMessagesPerPair) } : {}),
        ...(numberOrUndefined(value.maxBoardUpdatesPerKey) !== undefined ? { maxBoardUpdatesPerKey: numberOrUndefined(value.maxBoardUpdatesPerKey) } : {}),
        ...(numberOrUndefined(value.quietWindowMs) !== undefined ? { quietWindowMs: numberOrUndefined(value.quietWindowMs) } : {}),
        ...(numberOrUndefined(value.threadTimeoutMs) !== undefined ? { threadTimeoutMs: numberOrUndefined(value.threadTimeoutMs) } : {}),
        ...(numberOrUndefined(value.loopDetectionThreshold) !== undefined ? { loopDetectionThreshold: numberOrUndefined(value.loopDetectionThreshold) } : {}),
        ...(booleanOrUndefined(value.confirmModeEnabled) !== undefined ? { confirmModeEnabled: booleanOrUndefined(value.confirmModeEnabled) } : {}),
        ...(numberOrUndefined(value.cooldownMs) !== undefined ? { cooldownMs: numberOrUndefined(value.cooldownMs) } : {}),
    }
}

function normalizeTeamDraftContent(value: unknown): TeamDraftContent {
    if (!isRecord(value)) {
        throw new Error('Team draft content must be an object.')
    }
    if (!isRecord(value.participants)) {
        throw new Error('Team draft content requires participants.')
    }
    if (!Array.isArray(value.relations)) {
        throw new Error('Team draft content requires relations.')
    }

    const teamRules = normalizeOptionalStringArray(value.teamRules, 'Team draft teamRules')
    const position = normalizeOptionalPoint(value.position, 'Team draft position')
    const safety = normalizeTeamSafety(value.safety, 'Team draft safety')
    const meta = normalizeTeamMetadata(value.meta, 'Team draft meta')

    return {
        ...(stringOrUndefined(value.description) !== undefined ? { description: stringOrUndefined(value.description) } : {}),
        ...(teamRules !== undefined ? { teamRules } : {}),
        participants: Object.fromEntries(
            Object.entries(value.participants).map(([key, participant]) => [
                key,
                normalizeTeamParticipantBinding(participant, `Team draft participants.${key}`),
            ]),
        ),
        relations: value.relations.map((relation, index) => normalizeTeamRelation(relation, `Team draft relations[${index}]`)),
        ...(position !== undefined ? { position } : {}),
        ...(numberOrUndefined(value.width) !== undefined ? { width: numberOrUndefined(value.width) } : {}),
        ...(numberOrUndefined(value.height) !== undefined ? { height: numberOrUndefined(value.height) } : {}),
        ...(booleanOrUndefined(value.hidden) !== undefined ? { hidden: booleanOrUndefined(value.hidden) } : {}),
        ...(safety !== undefined ? { safety } : {}),
        ...(meta !== undefined ? { meta } : {}),
    }
}

function normalizeDraftContent<K extends DraftKind>(kind: K, content: unknown): DraftContentMap[K] {
    switch (kind) {
        case 'instruction':
        case 'skill':
            if (typeof content !== 'string') {
                throw new Error(`${kind} draft content must be a string.`)
            }
            return content as DraftContentMap[K]
        case 'agent':
            return normalizeAgentDraftContent(content) as DraftContentMap[K]
        case 'team':
            return normalizeTeamDraftContent(content) as DraftContentMap[K]
    }
}

export function normalizeRequestDraftContent<K extends DraftKind>(kind: K, content: unknown): DraftContentMap[K] {
    try {
        return normalizeDraftContent(kind, content)
    } catch (error: unknown) {
        throw new StudioValidationError(error instanceof Error ? error.message : 'Invalid draft content.')
    }
}

export function normalizeDraftFile(raw: unknown, expectedKind: DraftKind): DraftFile {
    if (!isRecord(raw)) {
        throw new Error('Draft file must be an object.')
    }
    if (!DRAFT_KIND_SET.has(raw.kind as DraftKind) || raw.kind !== expectedKind) {
        throw new Error(`Draft file kind must be ${expectedKind}.`)
    }
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
        throw new Error('Draft file requires string id and name.')
    }
    if (typeof raw.createdAt !== 'number' || typeof raw.updatedAt !== 'number') {
        throw new Error('Draft file requires numeric timestamps.')
    }

    const tags = normalizeOptionalStringArray(raw.tags, 'Draft tags')
    const derivedFrom = stringOrNullOrUndefined(raw.derivedFrom)
    const formatVersion = numberOrUndefined(raw.formatVersion)
    return {
        id: raw.id,
        kind: expectedKind,
        name: raw.name,
        content: normalizeDraftContent(expectedKind, raw.content) as DraftContent,
        ...(stringOrUndefined(raw.slug) !== undefined ? { slug: stringOrUndefined(raw.slug) } : {}),
        ...(stringOrUndefined(raw.description) !== undefined ? { description: stringOrUndefined(raw.description) } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(derivedFrom !== undefined ? { derivedFrom } : {}),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        ...(formatVersion !== undefined ? { formatVersion } : {}),
    }
}

export function isAgentDraftFile(draft: DraftFile): draft is TypedDraftFile<'agent'> {
    return draft.kind === 'agent' && !!draft.content && typeof draft.content === 'object'
}

export function isTeamDraftFile(draft: DraftFile): draft is TypedDraftFile<'team'> {
    return draft.kind === 'team' && !!draft.content && typeof draft.content === 'object'
}
