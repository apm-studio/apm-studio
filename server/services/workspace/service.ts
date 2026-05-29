import fs from 'fs/promises'
import type {
    DeleteWorkspaceResponse,
    SavedWorkspaceSnapshot,
    SavedWorkspaceSummary,
    SaveWorkspaceResponse,
    SetWorkspaceHiddenResponse,
    WorkspaceAgentSnapshot,
    WorkspaceSnapshot,
} from '../../../shared/workspace-contracts.js'
import type { ApiServiceFailure } from '../../../shared/api-contracts.js'
import { workspaceDir } from '../../lib/config.js'
import { apiServiceFailure } from '../../lib/api-service-failure.js'
import { pruneStaleAgentProjections } from '../opencode-projection/workspace-agent-projection-service.js'
import {
    readApmWorkspaceSnapshotForDir,
    writeApmPackagesForWorkspace,
} from '../apm-package/workspace.js'
import { purgeLinkedOpencodeData } from './delete-cleanup.js'
import {
    isRecord,
    isWorkspaceAgentSnapshot,
    mergeApmWorkspaceIntoSavedSnapshot,
} from './snapshot-merge.js'
import {
    isWorkspacePathSafe,
    listSavedWorkspaceSummaries,
    normalizeWorkingDir,
    readSavedWorkspaceDocumentForId,
    readSavedWorkspaceSnapshotForDir,
    validateWorkspaceId,
    workspaceFromSavedDocument,
    workspaceIdForWorkingDir,
    writeSavedWorkspaceDocument,
    writeSavedWorkspaceDocumentForId,
} from './document-store.js'

type GetSavedWorkspaceResult = { ok: true; workspace: SavedWorkspaceSnapshot } | ApiServiceFailure
type SaveWorkspaceSnapshotResult = SaveWorkspaceResponse | ApiServiceFailure
type SetWorkspaceHiddenResult = SetWorkspaceHiddenResponse | ApiServiceFailure
type DeleteWorkspaceResult = DeleteWorkspaceResponse | ApiServiceFailure

async function readWorkspaceSnapshotForDir(workingDir: string): Promise<WorkspaceSnapshot | null> {
    const normalized = normalizeWorkingDir(workingDir)
    if (!normalized) {
        return null
    }

    const apmWorkspace = await readApmWorkspaceSnapshotForDir(normalized)
    if (apmWorkspace) {
        return apmWorkspace as WorkspaceSnapshot
    }

    return readSavedWorkspaceSnapshotForDir(normalized)
}

export async function listWorkspaceAgentsForDir(workingDir: string): Promise<WorkspaceAgentSnapshot[]> {
    const workspace = await readWorkspaceSnapshotForDir(workingDir)
    if (!workspace || !Array.isArray(workspace.agents)) {
        return []
    }

    return workspace.agents.filter(isWorkspaceAgentSnapshot)
}

export async function listSavedWorkspaces(includeHidden = false): Promise<SavedWorkspaceSummary[]> {
    return listSavedWorkspaceSummaries(includeHidden)
}

export async function getSavedWorkspace(rawId: string): Promise<GetSavedWorkspaceResult> {
    const id = validateWorkspaceId(rawId)
    if (!id) {
        return apiServiceFailure(400, 'Invalid workspace id')
    }

    if (!isWorkspacePathSafe(id)) {
        return apiServiceFailure(400, 'Invalid workspace id')
    }

    const document = await readSavedWorkspaceDocumentForId(id)
    if (!document) {
        return apiServiceFailure(404, 'Workspace not found')
    }

    const workspace = workspaceFromSavedDocument(document)
    const workingDir = normalizeWorkingDir(workspace.workingDir || '')
    if (!workingDir) {
        return { ok: true as const, workspace }
    }

    try {
        const apmWorkspace = await readApmWorkspaceSnapshotForDir(workingDir)
        if (!apmWorkspace) {
            return { ok: true as const, workspace }
        }

        return {
            ok: true as const,
            workspace: mergeApmWorkspaceIntoSavedSnapshot(workspace, apmWorkspace, workingDir),
        }
    } catch (error) {
        console.warn('[workspace] Failed to read APM package state for saved workspace', { workingDir, error })
        return apiServiceFailure(500, 'Failed to read APM package state')
    }
}

export async function saveWorkspaceSnapshot(body: SavedWorkspaceSnapshot): Promise<SaveWorkspaceSnapshotResult> {
    const workingDir = normalizeWorkingDir(body.workingDir || '')
    if (!workingDir) {
        return apiServiceFailure(400, 'workingDir is required')
    }

    const agentIds = Array.isArray(body.agents)
        ? body.agents
            .map((agent) => (isRecord(agent) && typeof agent.id === 'string' ? agent.id : ''))
            .filter(Boolean)
        : []

    await pruneStaleAgentProjections(workingDir, agentIds).catch((error) => {
        console.warn('[workspace] Failed to prune stale agent projections during save', { workingDir, error })
    })

    const id = workspaceIdForWorkingDir(workingDir)
    const existingWorkspace = await readSavedWorkspaceSnapshotForDir(workingDir)
        || await readWorkspaceSnapshotForDir(workingDir).catch((error) => {
            console.warn('[workspace] Failed to read existing APM workspace state during save', { workingDir, error })
            return null
        })
    const workspace = {
        ...body,
        workingDir,
        hiddenFromList: body.hiddenFromList ?? (existingWorkspace?.hiddenFromList === true),
    }
    if (!isWorkspacePathSafe(id)) {
        return apiServiceFailure(400, 'Invalid workspace id')
    }

    try {
        await writeApmPackagesForWorkspace(workingDir, workspace)
    } catch (error) {
        console.warn('[workspace] Failed to write APM package state during save', { workingDir, error })
        return apiServiceFailure(500, 'Failed to write APM package state')
    }

    const { updatedAt } = await writeSavedWorkspaceDocument(id, workspace)

    import('../studio-assistant/assistant-service.js').then(({ ensureAssistantAgent }) =>
        ensureAssistantAgent(workingDir).catch(() => {}),
    )

    return {
        ok: true as const,
        id,
        workingDir,
        updatedAt,
        hiddenFromList: workspace.hiddenFromList,
    }
}

export async function setSavedWorkspaceHidden(rawId: string, hiddenFromList: boolean): Promise<SetWorkspaceHiddenResult> {
    const id = validateWorkspaceId(rawId)
    if (!id) {
        return apiServiceFailure(400, 'Invalid workspace id')
    }

    if (!isWorkspacePathSafe(id)) {
        return apiServiceFailure(400, 'Invalid workspace id')
    }

    try {
        const document = await readSavedWorkspaceDocumentForId(id)
        if (!document) {
            return apiServiceFailure(404, 'Workspace not found')
        }
        document.hiddenFromList = hiddenFromList === true
        document.workspace = {
            ...document.workspace,
            hiddenFromList: document.hiddenFromList,
        }
        document.savedAt = Date.now()
        await writeSavedWorkspaceDocumentForId(id, document)
        return { ok: true as const, id, hiddenFromList: document.hiddenFromList }
    } catch {
        return apiServiceFailure(404, 'Workspace not found')
    }
}

export async function deleteSavedWorkspace(rawId: string): Promise<DeleteWorkspaceResult> {
    const id = validateWorkspaceId(rawId)
    if (!id) {
        return apiServiceFailure(400, 'Invalid workspace id')
    }

    try {
        const document = await readSavedWorkspaceDocumentForId(id)
        if (!document) {
            return apiServiceFailure(404, 'Workspace not found')
        }
        await purgeLinkedOpencodeData(workspaceFromSavedDocument(document))
        // Delete entire workspace directory (includes team-runtime data)
        await fs.rm(workspaceDir(id), { recursive: true, force: true })
        return { ok: true as const }
    } catch {
        return apiServiceFailure(404, 'Workspace not found')
    }
}
