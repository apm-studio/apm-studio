import path from 'path'
import { nanoid } from 'nanoid'
import type {
    ActAssetListItem,
    AssetListItem,
    PerformerAssetListItem,
} from '../../shared/asset-contracts.js'
import type { ModelConfigV1 } from '../../shared/dot-types.js'
import type { RuntimeModelCatalogEntry } from '../../shared/model-variants.js'
import { extractMcpServerNamesFromConfig } from '../../shared/mcp-config.js'
import { parseActAsset } from '../lib/dot-source.js'
import { listRuntimeModels } from '../lib/model-catalog.js'
import { readGlobalMcpCatalog } from '../lib/mcp-catalog.js'
import { listStudioAssets } from './asset-service.js'
import { installDotAsset } from './dot-service.js'
import {
    getSavedWorkspace,
    listSavedWorkspaces,
    saveWorkspaceSnapshot,
} from './workspace-service.js'

export type StartupAssetTarget = {
    kind: 'performer' | 'act'
    urn: string
}

export type StartupAssetPreparationResult = {
    kind: StartupAssetTarget['kind']
    urn: string
    nodeId: string
    created: boolean
    workspaceId?: string
}

type ModelConfig = ModelConfigV1 & {
    provider: string
    modelId: string
}

type RegistryAssetRef = {
    kind: 'registry'
    urn: string
}

type DraftAssetRef = {
    kind: 'draft'
    draftId: string
}

type AssetRef = RegistryAssetRef | DraftAssetRef

type PerformerNodeSnapshot = {
    id: string
    name: string
    position: { x: number; y: number }
    width?: number
    height?: number
    scope: 'shared'
    model: ModelConfig | null
    modelPlaceholder?: ModelConfig | null
    modelVariant?: string | null
    agentId?: string | null
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    mcpServerNames: string[]
    mcpBindingMap?: Record<string, string>
    declaredMcpConfig?: Record<string, unknown> | null
    planMode?: boolean
    hidden?: boolean
    meta?: {
        derivedFrom?: string | null
        publishBindingUrn?: string | null
        authoring?: {
            slug?: string
            description?: string
            tags?: string[]
        }
    }
}

type WorkspaceActParticipantBindingSnapshot = {
    performerRef: AssetRef
    displayName?: string
    subscriptions?: Record<string, unknown>
    position: { x: number; y: number }
}

type WorkspaceActSnapshot = {
    id: string
    name: string
    description?: string
    actRules?: string[]
    position: { x: number; y: number }
    width: number
    height: number
    participants: Record<string, WorkspaceActParticipantBindingSnapshot>
    relations: Array<{
        id: string
        between: [string, string]
        direction: string
        name?: string
        description?: string
    }>
    hidden?: boolean
    createdAt: number
    meta?: {
        derivedFrom?: string | null
        authoring?: {
            slug?: string
            description?: string
            tags?: string[]
        }
    }
}

type WorkspaceSnapshot = Record<string, unknown> & {
    schemaVersion: 1
    workingDir: string
    performers: PerformerNodeSnapshot[]
    acts: WorkspaceActSnapshot[]
    markdownEditors: unknown[]
    canvasTerminals?: unknown[]
}

type CanvasRect = {
    x: number
    y: number
    width: number
    height: number
}

const PERFORMER_DEFAULT_WIDTH = 320
const PERFORMER_DEFAULT_HEIGHT = 480
const ACT_DEFAULT_WIDTH = PERFORMER_DEFAULT_WIDTH * 2
const ACT_DEFAULT_EXPANDED_HEIGHT = PERFORMER_DEFAULT_HEIGHT * 2
const DEFAULT_RECT_PADDING = 32
const DEFAULT_FALLBACK_MARGIN = 60
const MAX_SEARCH_RADIUS = 12

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)))
}

function normalizeWorkingDir(input: string) {
    const resolved = path.resolve(input)
    const root = path.parse(resolved).root
    return resolved !== root ? resolved.replace(/[\\/]+$/, '') : resolved
}

function registryAssetRef(urn: string | null | undefined): RegistryAssetRef | null {
    const normalized = urn?.trim()
    return normalized ? { kind: 'registry', urn: normalized } : null
}

function registryAssetRefs(urns: string[] | undefined | null): RegistryAssetRef[] {
    return (urns || [])
        .map((urn) => registryAssetRef(urn))
        .filter((ref): ref is RegistryAssetRef => ref !== null)
}

function sanitizeMcpBindingMap(mcpBindingMap: Record<string, string> | null | undefined) {
    return Object.fromEntries(
        Object.entries(mcpBindingMap || {}).filter(([placeholderName, serverName]) => !!placeholderName && !!serverName),
    )
}

function buildAutoMcpBindingMap(
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

function normalizeModelValue(value: unknown): ModelConfig | null {
    if (isRecord(value)) {
        const provider = typeof value.provider === 'string' ? value.provider.trim() : ''
        const modelId = typeof value.modelId === 'string' ? value.modelId.trim() : ''
        return provider && modelId ? { ...(value as ModelConfigV1), provider, modelId } : null
    }

    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    if (!normalized) {
        return null
    }

    const slashIndex = normalized.indexOf('/')
    const colonIndex = normalized.indexOf(':')
    const separatorIndex = slashIndex > 0 ? slashIndex : colonIndex > 0 ? colonIndex : -1
    if (separatorIndex === -1) {
        return null
    }

    const provider = normalized.slice(0, separatorIndex).trim()
    const modelId = normalized.slice(separatorIndex + 1).trim()
    return provider && modelId ? { provider, modelId } : null
}

function resolveImportedModel(
    model: unknown,
    runtimeModels: RuntimeModelCatalogEntry[],
): { model: ModelConfig | null; modelPlaceholder: ModelConfig | null } {
    const requested = normalizeModelValue(model)
    if (!requested) {
        return { model: null, modelPlaceholder: null }
    }

    const match = runtimeModels.find((entry) => (
        entry.connected
        && entry.provider === requested.provider
        && entry.id === requested.modelId
    ))

    if (match) {
        return {
            model: {
                provider: match.provider,
                modelId: match.id,
            },
            modelPlaceholder: requested,
        }
    }

    return { model: null, modelPlaceholder: requested }
}

function normalizePerformerAssetInput(
    asset: PerformerAssetListItem & {
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
    },
) {
    const declaredMcpConfig = isRecord(asset.mcpConfig) ? asset.mcpConfig : null
    const normalizedMcpServerNames = unique(asset.mcpServerNames || extractMcpServerNamesFromConfig(declaredMcpConfig))
    const autoBindingMap = buildAutoMcpBindingMap(declaredMcpConfig, normalizedMcpServerNames)
    const directMcpServerNames = normalizedMcpServerNames.filter((name) => !(name in autoBindingMap))

    return {
        name: asset.name,
        talRef: registryAssetRef(asset.talUrn),
        danceRefs: registryAssetRefs(asset.danceUrns),
        model: normalizeModelValue(asset.model),
        modelVariant: asset.modelVariant || null,
        modelPlaceholder: asset.modelPlaceholder || null,
        mcpServerNames: directMcpServerNames,
        mcpBindingMap: {
            ...autoBindingMap,
            ...(asset.mcpBindingMap || {}),
        },
        declaredMcpConfig,
        meta: asset.urn ? { derivedFrom: asset.urn, publishBindingUrn: asset.urn } : undefined,
    }
}

function createPerformerNodeFromAsset(input: {
    id: string
    asset: PerformerAssetListItem & {
        modelPlaceholder?: ModelConfig | null
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
    }
    x: number
    y: number
    hidden?: boolean
}): PerformerNodeSnapshot {
    const normalized = normalizePerformerAssetInput(input.asset)
    return {
        id: input.id,
        name: normalized.name,
        position: { x: input.x, y: input.y },
        width: PERFORMER_DEFAULT_WIDTH,
        height: PERFORMER_DEFAULT_HEIGHT,
        scope: 'shared',
        model: normalized.model,
        ...(normalized.modelPlaceholder ? { modelPlaceholder: normalized.modelPlaceholder } : {}),
        ...(normalized.modelVariant ? { modelVariant: normalized.modelVariant } : {}),
        agentId: null,
        talRef: normalized.talRef,
        danceRefs: normalized.danceRefs,
        mcpServerNames: normalized.mcpServerNames,
        mcpBindingMap: sanitizeMcpBindingMap(normalized.mcpBindingMap),
        declaredMcpConfig: normalized.declaredMcpConfig,
        ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        ...(normalized.meta ? { meta: normalized.meta } : {}),
    }
}

function withStudioImportContext(
    asset: PerformerAssetListItem,
    context: { runtimeModels: RuntimeModelCatalogEntry[]; availableMcpServerNames: string[] },
): PerformerAssetListItem & { model: ModelConfig | null; modelPlaceholder: ModelConfig | null; mcpServerNames: string[] } {
    const resolved = resolveImportedModel(asset.model ?? null, context.runtimeModels)
    const declaredNames = extractMcpServerNamesFromConfig(asset.mcpConfig)
    const allowed = new Set(context.availableMcpServerNames)

    return {
        ...asset,
        model: resolved.model,
        modelPlaceholder: resolved.modelPlaceholder,
        mcpServerNames: declaredNames.filter((name) => allowed.has(name)),
    }
}

function uniqueName(desired: string, existingNames: string[]) {
    if (!existingNames.includes(desired)) return desired
    let index = 2
    while (existingNames.includes(`${desired} (${index})`)) index += 1
    return `${desired} (${index})`
}

function getMaxPerformerCounter(performers: Array<{ id: string }>) {
    return performers.reduce((max, performer) => {
        const match = performer.id.match(/^performer-(\d+)$/)
        if (!match) {
            return max
        }
        return Math.max(max, Number.parseInt(match[1], 10))
    }, 0)
}

function buildCandidateOffsets(radius: number) {
    if (radius === 0) {
        return [{ col: 0, row: 0 }]
    }

    const entries: Array<{ col: number; row: number }> = []
    for (let row = -radius; row <= radius; row += 1) {
        for (let col = -radius; col <= radius; col += 1) {
            if (Math.max(Math.abs(col), Math.abs(row)) !== radius) continue
            entries.push({ col, row })
        }
    }

    return entries.sort((left, right) => {
        const leftScore = Math.abs(left.col) + Math.abs(left.row)
        const rightScore = Math.abs(right.col) + Math.abs(right.row)
        if (leftScore !== rightScore) return leftScore - rightScore
        if (Math.abs(left.row) !== Math.abs(right.row)) return Math.abs(left.row) - Math.abs(right.row)
        if (left.row !== right.row) return left.row - right.row
        return left.col - right.col
    })
}

function overlaps(left: CanvasRect, right: CanvasRect, padding = DEFAULT_RECT_PADDING) {
    return !(
        left.x + left.width + padding <= right.x
        || right.x + right.width + padding <= left.x
        || left.y + left.height + padding <= right.y
        || right.y + right.height + padding <= left.y
    )
}

function collectVisibleCanvasNodeRects(performers: PerformerNodeSnapshot[], acts: WorkspaceActSnapshot[]): CanvasRect[] {
    const performerRects = performers
        .filter((performer) => performer.hidden !== true)
        .map((performer) => ({
            x: performer.position.x,
            y: performer.position.y,
            width: performer.width || PERFORMER_DEFAULT_WIDTH,
            height: performer.height || PERFORMER_DEFAULT_HEIGHT,
        }))

    const actRects = acts
        .filter((act) => act.hidden !== true)
        .map((act) => ({
            x: act.position.x,
            y: act.position.y,
            width: act.width || ACT_DEFAULT_WIDTH,
            height: act.height || ACT_DEFAULT_EXPANDED_HEIGHT,
        }))

    return [...performerRects, ...actRects]
}

function resolveCanvasNodeSpawnPosition(input: {
    occupiedRects: CanvasRect[]
    width: number
    height: number
}) {
    const anchor = {
        x: (input.width / 2) + DEFAULT_FALLBACK_MARGIN,
        y: (input.height / 2) + DEFAULT_FALLBACK_MARGIN,
    }
    const base = {
        x: Math.round(anchor.x - (input.width / 2)),
        y: Math.round(anchor.y - (input.height / 2)),
    }
    const stepX = input.width + DEFAULT_RECT_PADDING
    const stepY = input.height + DEFAULT_RECT_PADDING

    for (let radius = 0; radius <= MAX_SEARCH_RADIUS; radius += 1) {
        for (const offset of buildCandidateOffsets(radius)) {
            const candidate = {
                x: base.x + (offset.col * stepX),
                y: base.y + (offset.row * stepY),
                width: input.width,
                height: input.height,
            }
            if (!input.occupiedRects.some((rect) => overlaps(candidate, rect))) {
                return { x: candidate.x, y: candidate.y }
            }
        }
    }

    return base
}

function createEmptyWorkspace(workingDir: string): WorkspaceSnapshot {
    return {
        schemaVersion: 1,
        workingDir,
        performers: [],
        acts: [],
        markdownEditors: [],
        canvasTerminals: [],
    }
}

function normalizeWorkspaceSnapshot(raw: Record<string, unknown>, workingDir: string): WorkspaceSnapshot {
    return {
        ...raw,
        schemaVersion: 1,
        workingDir,
        performers: Array.isArray(raw.performers) ? raw.performers as PerformerNodeSnapshot[] : [],
        acts: Array.isArray(raw.acts) ? raw.acts as WorkspaceActSnapshot[] : [],
        markdownEditors: Array.isArray(raw.markdownEditors) ? raw.markdownEditors : [],
        canvasTerminals: Array.isArray(raw.canvasTerminals) ? raw.canvasTerminals : [],
    }
}

async function loadWorkspaceForWorkingDir(workingDir: string): Promise<{ id?: string; snapshot: WorkspaceSnapshot }> {
    const normalizedWorkingDir = normalizeWorkingDir(workingDir)
    const workspaces = await listSavedWorkspaces(true)
    const matchingWorkspace = workspaces.find(
        (workspace) => normalizeWorkingDir(workspace.workingDir) === normalizedWorkingDir,
    )
    if (!matchingWorkspace) {
        return { snapshot: createEmptyWorkspace(normalizedWorkingDir) }
    }

    const result = await getSavedWorkspace(matchingWorkspace.id)
    if (!result.ok || !isRecord(result.workspace)) {
        return { snapshot: createEmptyWorkspace(normalizedWorkingDir) }
    }

    return {
        id: matchingWorkspace.id,
        snapshot: normalizeWorkspaceSnapshot(result.workspace, normalizedWorkingDir),
    }
}

async function findInstalledAssetByUrn(cwd: string, kind: StartupAssetTarget['kind'], urn: string) {
    const assets = await listStudioAssets(cwd, kind)
    return assets.find((entry) => entry.urn === urn) || null
}

async function ensureInstalledAssetByUrn(cwd: string, target: StartupAssetTarget): Promise<AssetListItem> {
    const installedAsset = await findInstalledAssetByUrn(cwd, target.kind, target.urn)
    if (installedAsset) {
        return installedAsset
    }

    await installDotAsset(cwd, {
        urn: target.urn,
        force: false,
        scope: 'stage',
    })

    const installedAfterFetch = await findInstalledAssetByUrn(cwd, target.kind, target.urn)
    if (!installedAfterFetch) {
        throw new Error(`Installed ${target.kind} asset was not found after install: ${target.urn}`)
    }

    return installedAfterFetch
}

async function loadPerformerImportContext(cwd: string) {
    const [runtimeModels, globalMcpCatalog] = await Promise.all([
        listRuntimeModels(cwd).catch(() => []),
        readGlobalMcpCatalog().catch(() => ({})),
    ])
    return {
        runtimeModels,
        availableMcpServerNames: Object.keys(globalMcpCatalog),
    }
}

function findPerformerByUrn(workspace: WorkspaceSnapshot, urn: string) {
    return [...workspace.performers].reverse().find((performer) => performer.meta?.derivedFrom === urn) || null
}

function findActByUrn(workspace: WorkspaceSnapshot, urn: string) {
    return [...workspace.acts].reverse().find((act) => act.meta?.derivedFrom === urn) || null
}

function normalizeSubscriptions(
    subscriptions: unknown,
    idMapping: Record<string, string>,
): Record<string, unknown> | undefined {
    if (!isRecord(subscriptions)) {
        return undefined
    }

    const messagesFrom = Array.isArray(subscriptions.messagesFrom)
        ? subscriptions.messagesFrom.map((entry) => typeof entry === 'string' ? idMapping[entry] || entry : entry)
        : undefined

    return {
        ...subscriptions,
        ...(messagesFrom ? { messagesFrom } : {}),
    }
}

function resolveBindingDisplayName(binding: WorkspaceActParticipantBindingSnapshot | null | undefined, fallbackKey: string) {
    return binding?.displayName?.trim() || fallbackKey
}

async function buildMaterializedRegistryPerformers(
    cwd: string,
    workspace: WorkspaceSnapshot,
    participants: Record<string, WorkspaceActParticipantBindingSnapshot>,
) {
    const seeds: Array<{
        key: string
        urn: string
        binding: WorkspaceActParticipantBindingSnapshot
    }> = []

    for (const [key, binding] of Object.entries(participants)) {
        if (binding.performerRef.kind !== 'registry') continue

        const urn = binding.performerRef.urn
        const alreadyExists = workspace.performers.some((performer) => performer.meta?.derivedFrom === urn)
        if (alreadyExists) continue
        if (seeds.some((seed) => seed.urn === urn)) continue
        seeds.push({ key, urn, binding })
    }

    if (seeds.length === 0) {
        return []
    }

    const context = await loadPerformerImportContext(cwd)
    const performerAssets = await Promise.all(
        seeds.map(async (seed) => {
            const asset = await findInstalledAssetByUrn(cwd, 'performer', seed.urn)
            return asset?.kind === 'performer' ? asset : null
        }),
    )

    return seeds.map((seed, index): PerformerNodeSnapshot => {
        const detail = performerAssets[index]
        const x = 400 + index * 340
        const y = 650

        if (detail) {
            const normalized = withStudioImportContext(detail, context)
            const node = createPerformerNodeFromAsset({
                id: nanoid(12),
                asset: {
                    ...normalized,
                    name: resolveBindingDisplayName(seed.binding, seed.key),
                },
                x,
                y,
                hidden: true,
            })
            const authoring = {
                ...(detail.slug ? { slug: detail.slug } : {}),
                ...(detail.description ? { description: detail.description } : {}),
                ...(Array.isArray(detail.tags) ? { tags: detail.tags } : {}),
            }
            return {
                ...node,
                meta: {
                    ...node.meta,
                    ...(Object.keys(authoring).length > 0 ? { authoring } : {}),
                },
            }
        }

        return {
            id: nanoid(12),
            name: resolveBindingDisplayName(seed.binding, seed.key),
            position: { x, y },
            width: PERFORMER_DEFAULT_WIDTH,
            height: PERFORMER_DEFAULT_HEIGHT,
            scope: 'shared',
            model: null,
            talRef: null,
            danceRefs: [],
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
            hidden: true,
            meta: {
                derivedFrom: seed.urn,
                authoring: {
                    description: `Auto-created for Act participant "${seed.key}" (${seed.urn}). Configure a model to make this participant runnable.`,
                },
            },
        }
    })
}

async function preparePerformerTarget(
    workingDir: string,
    workspace: WorkspaceSnapshot,
    asset: PerformerAssetListItem,
): Promise<StartupAssetPreparationResult> {
    const existing = findPerformerByUrn(workspace, asset.urn || '')
    if (existing) {
        return {
            kind: 'performer',
            urn: asset.urn || '',
            nodeId: existing.id,
            created: false,
        }
    }

    const context = await loadPerformerImportContext(workingDir)
    const normalized = withStudioImportContext(asset, context)
    const id = `performer-${getMaxPerformerCounter(workspace.performers) + 1}`
    const spawnPosition = resolveCanvasNodeSpawnPosition({
        occupiedRects: collectVisibleCanvasNodeRects(workspace.performers, workspace.acts),
        width: PERFORMER_DEFAULT_WIDTH,
        height: PERFORMER_DEFAULT_HEIGHT,
    })

    workspace.performers = [
        ...workspace.performers,
        createPerformerNodeFromAsset({
            id,
            asset: {
                ...normalized,
                name: uniqueName(normalized.name, workspace.performers.map((performer) => performer.name)),
            },
            x: spawnPosition.x,
            y: spawnPosition.y,
        }),
    ]

    const saved = await saveWorkspaceSnapshot(workspace)
    return {
        kind: 'performer',
        urn: asset.urn || '',
        nodeId: id,
        created: true,
        workspaceId: saved.ok ? saved.id : undefined,
    }
}

async function prepareActTarget(
    workingDir: string,
    workspace: WorkspaceSnapshot,
    asset: ActAssetListItem,
): Promise<StartupAssetPreparationResult> {
    const existing = findActByUrn(workspace, asset.urn || '')
    if (existing) {
        return {
            kind: 'act',
            urn: asset.urn || '',
            nodeId: existing.id,
            created: false,
        }
    }

    const canonicalPayload = {
        kind: 'act' as const,
        urn: asset.urn || `act/@local/${asset.name || 'untitled'}`,
        description: asset.description,
        payload: {
            actRules: Array.isArray(asset.actRules) ? asset.actRules : undefined,
            participants: asset.participants || [],
            relations: asset.relations || [],
        },
    }
    const validated = parseActAsset(canonicalPayload)
    const participants: Record<string, WorkspaceActParticipantBindingSnapshot> = {}
    const idMapping: Record<string, string> = {}

    for (const node of validated.payload.participants) {
        idMapping[node.key] = `participant-${nanoid(8)}`
    }

    for (const node of validated.payload.participants) {
        const baseKey = node.key
        const newKey = idMapping[baseKey] || `participant-${nanoid(8)}`

        participants[newKey] = {
            performerRef: { kind: 'registry', urn: node.performer },
            displayName: baseKey,
            subscriptions: normalizeSubscriptions(node.subscriptions, idMapping),
            position: { x: Object.keys(participants).length * 300, y: 100 },
        }
    }

    const relations = validated.payload.relations.map((relation) => ({
        id: nanoid(8),
        between: [
            idMapping[relation.between[0]] || relation.between[0],
            idMapping[relation.between[1]] || relation.between[1],
        ] as [string, string],
        direction: relation.direction,
        name: relation.name,
        description: relation.description,
    }))

    const id = nanoid(12)
    const nextAct: WorkspaceActSnapshot = {
        id,
        name: asset.name || `Act ${workspace.acts.length + 1}`,
        description: asset.description,
        actRules: validated.payload.actRules,
        participants,
        relations,
        position: { x: 400 - ACT_DEFAULT_WIDTH / 2, y: 300 },
        width: ACT_DEFAULT_WIDTH,
        height: ACT_DEFAULT_EXPANDED_HEIGHT,
        createdAt: Date.now(),
        meta: {
            derivedFrom: asset.urn || null,
            authoring: {
                description: asset.description || '',
            },
        },
    }
    const materializedPerformers = await buildMaterializedRegistryPerformers(workingDir, workspace, participants)

    workspace.acts = [...workspace.acts, nextAct]
    workspace.performers = [...workspace.performers, ...materializedPerformers]

    const saved = await saveWorkspaceSnapshot(workspace)
    return {
        kind: 'act',
        urn: asset.urn || '',
        nodeId: id,
        created: true,
        workspaceId: saved.ok ? saved.id : undefined,
    }
}

export async function prepareStartupAssetTarget(
    workingDir: string,
    target: StartupAssetTarget,
): Promise<StartupAssetPreparationResult> {
    const normalizedWorkingDir = normalizeWorkingDir(workingDir)
    const { snapshot } = await loadWorkspaceForWorkingDir(normalizedWorkingDir)
    const asset = await ensureInstalledAssetByUrn(normalizedWorkingDir, target)

    if (target.kind === 'performer') {
        if (asset.kind !== 'performer') {
            throw new Error(`Expected performer asset for ${target.urn}.`)
        }
        return preparePerformerTarget(normalizedWorkingDir, snapshot, asset)
    }

    if (asset.kind !== 'act') {
        throw new Error(`Expected act asset for ${target.urn}.`)
    }
    return prepareActTarget(normalizedWorkingDir, snapshot, asset)
}
