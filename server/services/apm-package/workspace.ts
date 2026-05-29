import fs from 'fs/promises'
import { ensureApmStudioDir } from '../../lib/apm-studio-paths.js'
import type {
    WorkspaceAgentSnapshot,
    WorkspaceModelConfig,
    WorkspacePoint,
} from '../../../shared/workspace-contracts.js'
import { buildApmManifestForAgent } from './manifest.js'
import { agentFromExtension, normalizeAgent } from './manifest-agent-normalization.js'
import { readManifestFile, writePackageFiles } from './package-files.js'
import {
    localWorkspacePath,
    manifestPath,
    packageRoot,
} from './paths.js'
import type { ApmWorkspaceDocument, WorkspacePackageSnapshot } from './types.js'
import { isErrnoException, isRecord, readText } from './yaml-io.js'

type AgentUiStateKey =
    | 'position'
    | 'width'
    | 'height'
    | 'hidden'
    | 'scope'
    | 'mcpBindingMap'
    | 'declaredMcpConfig'
    | 'modelPlaceholder'

type AgentUiState = Pick<
    WorkspaceAgentSnapshot,
    AgentUiStateKey
>

type PackageAgentRead = {
    packageIds: string[]
    agents: WorkspaceAgentSnapshot[]
}

export async function readLocalWorkspaceDocument(
    workingDir: string,
): Promise<ApmWorkspaceDocument | null> {
    const raw = await readText(localWorkspacePath(workingDir))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
        !isRecord(parsed)
        || parsed.schemaVersion !== 1
        || parsed.product !== 'APM Studio'
        || !isRecord(parsed.workspace)
    ) {
        return null
    }
    return parsed as ApmWorkspaceDocument
}

export async function writeLocalWorkspaceDocument(
    workingDir: string,
    document: ApmWorkspaceDocument,
) {
    await ensureApmStudioDir(workingDir)
    await fs.writeFile(localWorkspacePath(workingDir), JSON.stringify(document, null, 2), 'utf-8')
}

export async function readApmWorkspaceSnapshotForDir(
    workingDir: string,
): Promise<WorkspacePackageSnapshot | null> {
    const document = await readLocalWorkspaceDocument(workingDir)
    if (!document) {
        const packageAgents = await readApmPackageAgents(workingDir)
        if (packageAgents.agents.length === 0) return null
        return {
            workingDir,
            agents: packageAgents.agents,
        }
    }

    const workspace = document.workspace || {}
    const packageAgents = await readApmPackageAgents(workingDir)

    return {
        ...workspace,
        workingDir,
        agents: mergeApmAgentsWithWorkspaceUi(packageAgents.agents, workspace.agents),
    }
}

export async function writeApmPackagesForWorkspace(
    workingDir: string,
    workspace: WorkspacePackageSnapshot,
): Promise<{ packageIds: string[] }> {
    const agents = Array.isArray(workspace.agents)
        ? workspace.agents.map(normalizeAgent).filter((entry): entry is WorkspaceAgentSnapshot => !!entry)
        : []
    const agentPackageIds = agents.map((agent) => agent.id)
    const packageIds = uniquePackageIds([
        ...await currentActivePackageIdsForSave(workingDir),
        ...agentPackageIds,
    ])

    for (const agent of agents) {
        await writePackageFiles(workingDir, agent.id, buildApmManifestForAgent(agent))
    }

    await writeLocalWorkspaceDocument(workingDir, {
        schemaVersion: 1,
        product: 'APM Studio',
        workingDir,
        savedAt: Date.now(),
        activePackageIds: packageIds,
        workspace: {
            ...workspace,
            workingDir,
        },
    })

    return { packageIds }
}

async function currentActivePackageIdsForSave(workingDir: string): Promise<string[]> {
    return await activePackageIds(workingDir) ?? await packageIdsFromDisk(workingDir)
}

function uniquePackageIds(packageIds: string[]) {
    return Array.from(new Set(packageIds.filter((entry) => typeof entry === 'string' && !!entry)))
}

export async function activePackageIds(workingDir: string): Promise<string[] | null> {
    const document = await readLocalWorkspaceDocument(workingDir)
    if (!document) return null
    return Array.isArray(document.activePackageIds)
        ? document.activePackageIds.filter((entry): entry is string => typeof entry === 'string' && !!entry)
        : []
}

export async function packageIdsFromDisk(workingDir: string): Promise<string[]> {
    const root = packageRoot(workingDir)
    try {
        const entries = await fs.readdir(root, { withFileTypes: true })
        return entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
    } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') return []
        throw error
    }
}

async function readApmPackageAgents(workingDir: string): Promise<PackageAgentRead> {
    const packageIds = await activePackageIds(workingDir) ?? await packageIdsFromDisk(workingDir)
    const agents: WorkspaceAgentSnapshot[] = []

    for (const packageId of packageIds) {
        const manifest = await readManifestFile(manifestPath(workingDir, packageId)).catch(() => null)
        const agent = manifest?.['x-apm']?.agent
        if (agent) {
            agents.push(agentFromExtension(agent, manifest))
        }
    }

    return { packageIds, agents }
}

function mergeApmAgentsWithWorkspaceUi(
    apmAgents: WorkspaceAgentSnapshot[],
    workspaceAgents: unknown,
): WorkspaceAgentSnapshot[] {
    const workspaceById = new Map<string, Record<string, unknown>>()
    if (Array.isArray(workspaceAgents)) {
        for (const agent of workspaceAgents) {
            if (isRecord(agent) && typeof agent.id === 'string' && agent.id) {
                workspaceById.set(agent.id, agent)
            }
        }
    }

    return apmAgents.map((agent) => {
        const workspaceAgent = workspaceById.get(agent.id)
        if (!workspaceAgent) {
            return agent
        }

        return {
            ...agent,
            ...agentUiStateFromWorkspace(workspaceAgent),
        }
    })
}

function agentUiStateFromWorkspace(workspaceAgent: Record<string, unknown>): Partial<AgentUiState> {
    const uiState: Partial<AgentUiState> = {}
    const position = pointFromUnknown(workspaceAgent.position)
    if (position) uiState.position = position
    const width = positiveNumberFromUnknown(workspaceAgent.width)
    if (width !== undefined) uiState.width = width
    const height = positiveNumberFromUnknown(workspaceAgent.height)
    if (height !== undefined) uiState.height = height
    if (workspaceAgent.hidden !== undefined) uiState.hidden = workspaceAgent.hidden === true
    if (workspaceAgent.scope === 'shared') uiState.scope = 'shared'
    const mcpBindingMap = stringMapFromUnknown(workspaceAgent.mcpBindingMap)
    if (mcpBindingMap) uiState.mcpBindingMap = mcpBindingMap
    const declaredMcpConfig = recordOrNullFromUnknown(workspaceAgent.declaredMcpConfig)
    if (declaredMcpConfig !== undefined) uiState.declaredMcpConfig = declaredMcpConfig
    const modelPlaceholder = modelFromUnknown(workspaceAgent.modelPlaceholder)
    if (modelPlaceholder !== undefined) uiState.modelPlaceholder = modelPlaceholder
    return uiState
}

function pointFromUnknown(value: unknown): WorkspacePoint | null {
    if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
        return null
    }
    return { x: value.x, y: value.y }
}

function positiveNumberFromUnknown(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function recordOrNullFromUnknown(value: unknown): Record<string, unknown> | null | undefined {
    if (value === null) return null
    return isRecord(value) ? value : undefined
}

function modelFromUnknown(value: unknown): WorkspaceModelConfig | null | undefined {
    if (value === null) return null
    if (
        !isRecord(value)
        || typeof value.provider !== 'string'
        || typeof value.modelId !== 'string'
        || !value.provider.trim()
        || !value.modelId.trim()
    ) {
        return undefined
    }
    return {
        provider: value.provider,
        modelId: value.modelId,
        ...(typeof value.temperature === 'number' && Number.isFinite(value.temperature) ? { temperature: value.temperature } : {}),
        ...(typeof value.maxTokens === 'number' && Number.isFinite(value.maxTokens) ? { maxTokens: value.maxTokens } : {}),
    }
}

function stringMapFromUnknown(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined
    const entries = Object.entries(value).filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string'
        && entry[0].trim().length > 0
        && typeof entry[1] === 'string'
        && entry[1].trim().length > 0
    ))
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}
