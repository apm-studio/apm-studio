import type { GitHubDanceSyncStatus } from './asset-contracts.js'

export type DotStatusResponse = {
    initialized: boolean
    stageInitialized: boolean
    globalInitialized: boolean
    dotDir: string
    globalDotDir: string
    projectDir: string
}

export type DotInitResponse = {
    ok: boolean
    dotDir: string
    scope: string
}

export type DotAuthUserResponse = {
    authenticated: boolean
    username: string | null
    error?: string
}

export type DotLoginResponse = {
    ok: boolean
    started: boolean
    alreadyRunning?: boolean
    alreadyAuthenticated?: boolean
    username?: string | null
    authUrl?: string
    browserOpened?: boolean
}

export type DotInstallRequest = {
    urn: string
    localName?: string
    force?: boolean
    scope?: 'global' | 'stage'
}

export type DotSaveLocalRequest = {
    kind: 'tal' | 'dance' | 'performer' | 'act'
    slug: string
    stage?: string
    author?: string
    payload: unknown
}

export type DotPublishRequest = {
    kind: 'tal' | 'dance' | 'performer' | 'act'
    slug: string
    stage?: string
    payload?: unknown
    tags?: string[]
    providedAssets?: Array<{
        kind: 'tal' | 'performer' | 'act'
        urn: string
        payload: Record<string, unknown>
        tags?: string[]
    }>
    acknowledgedTos?: boolean
}

export type DotUninstallRequest = {
    kind: 'tal' | 'dance' | 'performer' | 'act'
    urn: string
}

export type DanceExportRequest = {
    draftId: string
    slug: string
    destinationParentPath: string
    overwrite?: boolean
}

export type DanceExportResponse = {
    ok: boolean
    draftId: string
    slug: string
    exportPath: string
    exportRelativeName: string
}

export type InstalledDanceLocator = {
    urn: string
    scope: 'global' | 'stage'
}

export type DotDanceUpdateCheckRequest = {
    assets: InstalledDanceLocator[]
    includeRepoDrift?: boolean
}

export type DotDanceUpdateCheckResponse = {
    results: Array<InstalledDanceLocator & {
        sync: GitHubDanceSyncStatus
    }>
}

export type DotDanceUpdateApplyRequest = {
    assets: InstalledDanceLocator[]
}

export type DotDanceUpdateApplyResponse = {
    updated: Array<InstalledDanceLocator & {
        sync: GitHubDanceSyncStatus
    }>
    skipped: Array<InstalledDanceLocator & {
        reason: string
        sync?: GitHubDanceSyncStatus
    }>
}

export type DotDanceReimportSourceRequest = InstalledDanceLocator

export type DotDanceReimportSourceResponse = {
    sourceUrl: string
    installed: Array<{ urn: string; name: string; description: string }>
    skippedExistingUrns: string[]
}

export const DOT_ASSET_KINDS = ['tal', 'dance', 'performer', 'act'] as const

export type DotAssetKind = typeof DOT_ASSET_KINDS[number]

export type DotAssetBase<K extends DotAssetKind, P> = {
    kind: K
    urn: string
    description?: string
    tags?: string[]
    payload: P
}

export type ParseResult<T> =
    | { success: true; data: T }
    | { success: false; error: string }

export type ParsedUrn<K extends DotAssetKind = DotAssetKind> = {
    kind: K
    owner: string
    stage: string
    name: string
}

export type ModelConfigV1 = {
    provider: string
    modelId: string
}

export type TalAssetPayloadV1 = {
    content: string
}

export type TalAsset = DotAssetBase<'tal', TalAssetPayloadV1>

export type DanceSkillMeta = {
    name: string
    description: string
    tags: string[]
    license?: string
    compatibility?: string
    metadata?: Record<string, string>
    allowedTools?: string
    content: string
}

export type DanceAssetPayloadV1 = {
    name: string
    description: string
    content: string
    tags: string[]
    license?: string
    compatibility?: string
    metadata?: Record<string, string>
    allowedTools?: string
}

export type DanceAsset = DotAssetBase<'dance', DanceAssetPayloadV1>

export type PerformerAssetPayloadV1 = {
    tal?: string
    dances?: string[]
    model?: ModelConfigV1
    modelVariant?: string
    mcp_config?: Record<string, unknown>
}

export type PerformerAsset = DotAssetBase<'performer', PerformerAssetPayloadV1>

export type ActParticipantSubscriptionsV1 = {
    messagesFrom?: string[]
    messageTags?: string[]
    callboardKeys?: string[]
    eventTypes?: Array<'runtime.idle'>
}

export type ActParticipantV1 = {
    key: string
    performer: string
    subscriptions?: ActParticipantSubscriptionsV1
}

export type ActRelationV1 = {
    between: [string, string]
    direction: 'both' | 'one-way'
    name: string
    description: string
}

export type ActAssetPayloadV1 = {
    actRules?: string[]
    participants: ActParticipantV1[]
    relations: ActRelationV1[]
}

export type ActAsset = DotAssetBase<'act', ActAssetPayloadV1>

export type TalAssetV1 = TalAsset
export type DanceAssetV1 = DanceAsset
export type PerformerAssetV1 = PerformerAsset
export type ActAssetV1 = ActAsset
export type AnyDotAssetV1 = TalAsset | DanceAsset | PerformerAsset | ActAsset

const URN_RE = /^(tal|dance|performer|act)\/@[A-Za-z0-9_-]+\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

export function asOptionalString(value: unknown): string | undefined {
    if (value === undefined) return undefined
    if (typeof value !== 'string') {
        throw new Error('must be a string when provided')
    }
    return value
}

export function asOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
    if (value === undefined) return undefined
    if (!Array.isArray(value)) {
        throw new Error(`${fieldName} must be an array of strings when provided`)
    }
    return Array.from(new Set(value.map((entry, index) => {
        if (typeof entry !== 'string') {
            throw new Error(`${fieldName}[${index}] must be a string`)
        }
        return entry
    })))
}

export function isDotAssetKind(value: string): value is DotAssetKind {
    return (DOT_ASSET_KINDS as readonly string[]).includes(value)
}

export function parseDotAssetUrn<K extends DotAssetKind = DotAssetKind>(
    urn: unknown,
    expectedKind?: K,
): ParsedUrn<K> {
    if (!isNonEmptyString(urn)) {
        throw new Error('urn must be a non-empty string')
    }
    if (!URN_RE.test(urn)) {
        throw new Error("urn must match '<kind>/@<owner>/<stage>/<name>'")
    }
    const [kind, rawOwner, stage, name] = urn.split('/')
    if (!isDotAssetKind(kind)) {
        throw new Error(`unsupported asset kind '${kind}'`)
    }
    if (expectedKind && kind !== expectedKind) {
        throw new Error(`urn kind must be '${expectedKind}'`)
    }
    return {
        kind: kind as K,
        owner: rawOwner.slice(1),
        stage,
        name,
    }
}

export function nameFromUrn(urn: string) {
    return parseDotAssetUrn(urn).name
}

export function stageFromUrn(urn: string) {
    return parseDotAssetUrn(urn).stage
}

export function ownerFromUrn(urn: string) {
    return `@${parseDotAssetUrn(urn).owner}`
}

export function slugFromUrn(urn: string) {
    return nameFromUrn(urn)
}

export function authorFromUrn(urn: string) {
    return ownerFromUrn(urn)
}

export function assertBaseAssetShape<K extends DotAssetKind>(
    input: unknown,
    kind: K,
): DotAssetBase<K, Record<string, unknown>> {
    if (!isRecord(input)) {
        throw new Error('asset must be an object')
    }
    if ('$schema' in input) {
        throw new Error('$schema is not supported in canonical assets')
    }
    if (input.kind !== kind) {
        throw new Error(`kind must be '${kind}'`)
    }
    const parsedUrn = parseDotAssetUrn(input.urn, kind)
    if (input.description !== undefined && typeof input.description !== 'string') {
        throw new Error('description must be a string when provided')
    }
    const tags = asOptionalStringArray(input.tags, 'tags')
    if (!isRecord(input.payload)) {
        throw new Error('payload must be an object')
    }
    return {
        kind,
        urn: `${parsedUrn.kind}/@${parsedUrn.owner}/${parsedUrn.stage}/${parsedUrn.name}`,
        ...(typeof input.description === 'string' ? { description: input.description } : {}),
        ...(tags ? { tags } : {}),
        payload: input.payload,
    }
}

export function safeParse<T>(fn: () => T): ParseResult<T> {
    try {
        return { success: true, data: fn() }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown parse error',
        }
    }
}

function unquoteYamlScalar(value: string) {
    const trimmed = value.trim()
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

function parseInlineArray(value: string) {
    const trimmed = value.trim()
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
        return null
    }
    return trimmed.slice(1, -1)
        .split(',')
        .map((entry) => unquoteYamlScalar(entry))
        .filter(Boolean)
}

function parseInlineObject(value: string) {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        return null
    }
    try {
        const parsed = JSON.parse(trimmed) as unknown
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

function parseSimpleFrontmatter(raw: string) {
    const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/)
    if (lines[0]?.trim() !== '---') {
        return { data: {} as Record<string, unknown>, content: raw }
    }
    const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (endIndex < 0) {
        return { data: {} as Record<string, unknown>, content: raw }
    }
    const data: Record<string, unknown> = {}
    let activeObjectKey: string | null = null
    for (const line of lines.slice(1, endIndex)) {
        const nestedMatch = line.match(/^\s{2,}([^:]+):\s*(.*)$/)
        if (nestedMatch && activeObjectKey) {
            const target = isRecord(data[activeObjectKey]) ? data[activeObjectKey] as Record<string, string> : {}
            target[nestedMatch[1].trim()] = unquoteYamlScalar(nestedMatch[2])
            data[activeObjectKey] = target
            continue
        }
        const match = line.match(/^([^:#]+):\s*(.*)$/)
        if (!match) continue
        const key = match[1].trim()
        const rawValue = match[2]
        if (!rawValue.trim()) {
            activeObjectKey = key
            data[key] = {}
            continue
        }
        activeObjectKey = null
        data[key] = parseInlineArray(rawValue) || parseInlineObject(rawValue) || unquoteYamlScalar(rawValue)
    }
    return {
        data,
        content: lines.slice(endIndex + 1).join('\n'),
    }
}

export function extractTags(metadata?: Record<string, unknown>): string[] {
    if (!metadata) return []
    const tagFields = ['tags', 'tag', 'keywords', 'keyword', 'category']
    const seen = new Set<string>()
    const result: string[] = []
    for (const field of tagFields) {
        const value = metadata[field]
        const items = Array.isArray(value)
            ? value.filter((entry): entry is string => typeof entry === 'string')
            : typeof value === 'string'
                ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
                : []
        for (const item of items) {
            const normalized = item.toLowerCase().trim()
            if (normalized && !seen.has(normalized)) {
                seen.add(normalized)
                result.push(normalized)
            }
        }
    }
    return result
}

export function parseDanceFromSkillMd(raw: string): DanceSkillMeta {
    const { data, content } = parseSimpleFrontmatter(raw)
    if (!isNonEmptyString(data.name)) {
        throw new Error("SKILL.md frontmatter must include a non-empty 'name' field")
    }
    if (!isNonEmptyString(data.description)) {
        throw new Error("SKILL.md frontmatter must include a non-empty 'description' field")
    }
    const metadata = isRecord(data.metadata)
        ? Object.fromEntries(
            Object.entries(data.metadata)
                .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
        : undefined
    const allowedTools = typeof data['allowed-tools'] === 'string'
        ? data['allowed-tools']
        : Array.isArray(data['allowed-tools'])
            ? data['allowed-tools'].filter((entry): entry is string => typeof entry === 'string').join(', ') || undefined
            : undefined
    return {
        name: data.name,
        description: data.description,
        content: content.trim(),
        tags: extractTags(metadata),
        ...(typeof data.license === 'string' ? { license: data.license } : {}),
        ...(typeof data.compatibility === 'string' ? { compatibility: data.compatibility } : {}),
        ...(metadata ? { metadata } : {}),
        ...(allowedTools ? { allowedTools } : {}),
    }
}

export function parseDanceAsset(input: unknown): DanceAsset {
    const base = assertBaseAssetShape(input, 'dance')
    const payload = base.payload
    if (!isNonEmptyString(payload.name)) {
        throw new Error('payload.name must be a non-empty string')
    }
    if (!isNonEmptyString(payload.description)) {
        throw new Error('payload.description must be a non-empty string')
    }
    if (!isNonEmptyString(payload.content)) {
        throw new Error('payload.content must be a non-empty string')
    }
    return {
        ...base,
        payload: {
            name: payload.name,
            description: payload.description,
            content: payload.content,
            tags: Array.isArray(payload.tags) ? payload.tags.filter((entry): entry is string => typeof entry === 'string') : [],
            ...(typeof payload.license === 'string' ? { license: payload.license } : {}),
            ...(typeof payload.compatibility === 'string' ? { compatibility: payload.compatibility } : {}),
            ...(isRecord(payload.metadata) ? { metadata: payload.metadata as Record<string, string> } : {}),
            ...(typeof payload.allowedTools === 'string' ? { allowedTools: payload.allowedTools } : {}),
        },
    }
}

function parseModelConfig(input: unknown): ModelConfigV1 {
    if (!isRecord(input)) {
        throw new Error('payload.model must be an object when provided')
    }
    if (!isNonEmptyString(input.provider)) {
        throw new Error('payload.model.provider must be a non-empty string')
    }
    if (!isNonEmptyString(input.modelId)) {
        throw new Error('payload.model.modelId must be a non-empty string')
    }
    return {
        provider: input.provider,
        modelId: input.modelId,
    }
}

export function parsePerformerAsset(input: unknown): PerformerAsset {
    const base = assertBaseAssetShape(input, 'performer')
    let tal: string | undefined
    if (base.payload.tal !== undefined) {
        if (!isNonEmptyString(base.payload.tal)) {
            throw new Error('payload.tal must be a non-empty string when provided')
        }
        parseDotAssetUrn(base.payload.tal, 'tal')
        tal = base.payload.tal
    }

    let dances: string[] | undefined
    if (base.payload.dances !== undefined) {
        if (!Array.isArray(base.payload.dances)) {
            throw new Error('payload.dances must be an array when provided')
        }
        dances = Array.from(new Set(base.payload.dances.map((entry, index) => {
            try {
                parseDotAssetUrn(entry, 'dance')
            } catch (error) {
                const message = error instanceof Error ? error.message : 'invalid dance urn'
                throw new Error(`payload.dances[${index}] ${message}`)
            }
            return entry as string
        })))
        if (dances.length === 0) {
            throw new Error('payload.dances must contain at least one dance URN when provided')
        }
    }

    if (!tal && (!dances || dances.length === 0)) {
        throw new Error("payload must include at least one of tal or dances")
    }

    let model: ModelConfigV1 | undefined
    if (base.payload.model !== undefined) {
        model = parseModelConfig(base.payload.model)
    }
    if (base.payload.modelVariant !== undefined && !isNonEmptyString(base.payload.modelVariant)) {
        throw new Error('payload.modelVariant must be a non-empty string when provided')
    }
    let mcpConfig: Record<string, unknown> | undefined
    if (base.payload.mcp_config !== undefined) {
        if (!isRecord(base.payload.mcp_config)) {
            throw new Error('payload.mcp_config must be an object when provided')
        }
        mcpConfig = base.payload.mcp_config
    }

    return {
        ...base,
        payload: {
            ...(tal ? { tal } : {}),
            ...(dances ? { dances } : {}),
            ...(model ? { model } : {}),
            ...(typeof base.payload.modelVariant === 'string' ? { modelVariant: base.payload.modelVariant } : {}),
            ...(mcpConfig ? { mcp_config: mcpConfig } : {}),
        },
    }
}

export function parseTalAsset(input: unknown): TalAsset {
    const base = assertBaseAssetShape(input, 'tal')
    if (!isNonEmptyString(base.payload.content)) {
        throw new Error('payload.content must be a non-empty markdown string')
    }
    return {
        ...base,
        payload: { content: base.payload.content },
    }
}

function parseOptionalStringArray(input: unknown, fieldName: string) {
    if (input === undefined) return undefined
    if (!Array.isArray(input)) {
        throw new Error(`${fieldName} must be an array of strings when provided`)
    }
    return Array.from(new Set(input.map((entry, index) => {
        if (!isNonEmptyString(entry)) {
            throw new Error(`${fieldName}[${index}] must be a non-empty string`)
        }
        return entry
    })))
}

function parseSubscriptions(input: unknown, fieldName: string): ActParticipantSubscriptionsV1 {
    if (!isRecord(input)) {
        throw new Error(`${fieldName} must be an object when provided`)
    }
    const messagesFrom = parseOptionalStringArray(input.messagesFrom, `${fieldName}.messagesFrom`)
    const messageTags = parseOptionalStringArray(input.messageTags, `${fieldName}.messageTags`)
    const callboardKeys = parseOptionalStringArray(input.callboardKeys, `${fieldName}.callboardKeys`)
    const eventTypes = parseOptionalStringArray(input.eventTypes, `${fieldName}.eventTypes`)
    if (eventTypes && eventTypes.some((entry) => entry !== 'runtime.idle')) {
        throw new Error(`${fieldName}.eventTypes only supports 'runtime.idle' in act.v1`)
    }
    return {
        ...(messagesFrom ? { messagesFrom } : {}),
        ...(messageTags ? { messageTags } : {}),
        ...(callboardKeys ? { callboardKeys } : {}),
        ...(eventTypes ? { eventTypes: eventTypes as Array<'runtime.idle'> } : {}),
    }
}

function parseParticipant(input: unknown, index: number): ActParticipantV1 {
    if (!isRecord(input)) {
        throw new Error(`payload.participants[${index}] must be an object`)
    }
    if ('id' in input) {
        throw new Error(`payload.participants[${index}].id is not supported; use key`)
    }
    if ('activeDances' in input) {
        throw new Error(`payload.participants[${index}].activeDances is not supported in act.v1`)
    }
    if (!isNonEmptyString(input.key)) {
        throw new Error(`payload.participants[${index}].key must be a non-empty string`)
    }
    if (!isNonEmptyString(input.performer)) {
        throw new Error(`payload.participants[${index}].performer must be a non-empty string`)
    }
    parseDotAssetUrn(input.performer, 'performer')
    return {
        key: input.key,
        performer: input.performer,
        ...(input.subscriptions !== undefined ? { subscriptions: parseSubscriptions(input.subscriptions, `payload.participants[${index}].subscriptions`) } : {}),
    }
}

function parseRelation(input: unknown, index: number): ActRelationV1 {
    if (!isRecord(input)) {
        throw new Error(`payload.relations[${index}] must be an object`)
    }
    for (const unsupported of ['id', 'permissions', 'maxCalls', 'timeout', 'sessionPolicy']) {
        if (unsupported in input) {
            throw new Error(`payload.relations[${index}].${unsupported} is not supported in act.v1`)
        }
    }
    if (!Array.isArray(input.between) || input.between.length !== 2) {
        throw new Error(`payload.relations[${index}].between must be a 2-item string tuple`)
    }
    const between = input.between.map((entry, betweenIndex) => {
        if (!isNonEmptyString(entry)) {
            throw new Error(`payload.relations[${index}].between[${betweenIndex}] must be a non-empty string`)
        }
        return entry
    }) as [string, string]
    if (input.direction !== 'both' && input.direction !== 'one-way') {
        throw new Error(`payload.relations[${index}].direction must be 'both' or 'one-way'`)
    }
    if (!isNonEmptyString(input.name)) {
        throw new Error(`payload.relations[${index}].name must be a non-empty string`)
    }
    if (!isNonEmptyString(input.description)) {
        throw new Error(`payload.relations[${index}].description must be a non-empty string`)
    }
    return {
        between,
        direction: input.direction,
        name: input.name,
        description: input.description,
    }
}

export function parseActAsset(input: unknown): ActAsset {
    const base = assertBaseAssetShape(input, 'act')
    const actRules = parseOptionalStringArray(base.payload.actRules, 'payload.actRules')
    if (!Array.isArray(base.payload.participants)) {
        throw new Error('payload.participants must be an array')
    }
    if (!Array.isArray(base.payload.relations)) {
        throw new Error('payload.relations must be an array')
    }
    const participants = base.payload.participants.map(parseParticipant)
    if (participants.length === 0) {
        throw new Error('payload.participants must contain at least one participant')
    }
    const participantKeys = new Set<string>()
    for (const participant of participants) {
        if (participantKeys.has(participant.key)) {
            throw new Error(`payload.participants contains duplicate key '${participant.key}'`)
        }
        participantKeys.add(participant.key)
    }
    const relations = base.payload.relations.map(parseRelation)
    for (const relation of relations) {
        if (!participantKeys.has(relation.between[0])) {
            throw new Error(`relation references unknown participant '${relation.between[0]}'`)
        }
        if (!participantKeys.has(relation.between[1])) {
            throw new Error(`relation references unknown participant '${relation.between[1]}'`)
        }
    }
    if (participants.length > 1 && relations.length === 0) {
        throw new Error('payload.relations must contain at least one relation when multiple participants exist')
    }
    return {
        ...base,
        payload: {
            ...(actRules ? { actRules } : {}),
            participants,
            relations,
        },
    }
}

export function parseDotAsset(input: unknown): AnyDotAssetV1 {
    if (!isRecord(input) || !('kind' in input)) {
        throw new Error('asset must be an object with a kind field')
    }
    switch (input.kind) {
        case 'tal':
            return parseTalAsset(input)
        case 'dance':
            return parseDanceAsset(input)
        case 'performer':
            return parsePerformerAsset(input)
        case 'act':
            return parseActAsset(input)
        default:
            throw new Error('kind must be one of: tal, dance, performer, act')
    }
}

export function safeParseDotAsset(input: unknown) {
    return safeParse(() => parseDotAsset(input))
}

export function safeParseActAsset(input: unknown) {
    return safeParse(() => parseActAsset(input))
}

export function safeParseDanceAsset(input: unknown) {
    return safeParse(() => parseDanceAsset(input))
}

export function safeParsePerformerAsset(input: unknown) {
    return safeParse(() => parsePerformerAsset(input))
}

export function safeParseTalAsset(input: unknown) {
    return safeParse(() => parseTalAsset(input))
}

export function projectRegistryMetadata(asset: AnyDotAssetV1) {
    return {
        urn: asset.urn,
        kind: asset.kind,
        owner: ownerFromUrn(asset.urn),
        name: nameFromUrn(asset.urn),
        tags: asset.tags || [],
    }
}
