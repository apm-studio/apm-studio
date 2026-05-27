import fs from 'fs/promises'
import type { WorkspacePerformerSnapshot } from '../workspace-service.js'
import { buildApmManifestForAgent, normalizePerformer, performerFromExtension } from './manifest.js'
import { readManifestFile, writePackageFiles } from './package-files.js'
import {
    apmStudioDir,
    localWorkspacePath,
    localWorkspacePathForRead,
    manifestPathForRead,
    packageRootForRead,
} from './paths.js'
import type { ApmWorkspaceDocument, WorkspacePackageSnapshot } from './types.js'
import { isErrnoException, isRecord, readText } from './yaml-io.js'

const PERFORMER_UI_STATE_KEYS = [
    'position',
    'width',
    'height',
    'hidden',
    'scope',
    'mcpBindingMap',
    'declaredMcpConfig',
    'modelPlaceholder',
] as const

type PackagePerformerRead = {
    packageIds: string[]
    performers: WorkspacePerformerSnapshot[]
}

export async function readLocalWorkspaceDocument(
    workingDir: string,
): Promise<ApmWorkspaceDocument | null> {
    const raw = await readText(await localWorkspacePathForRead(workingDir))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.workspace)) {
        return null
    }
    return parsed as ApmWorkspaceDocument
}

export async function writeLocalWorkspaceDocument(
    workingDir: string,
    document: ApmWorkspaceDocument,
) {
    await fs.writeFile(localWorkspacePath(workingDir), JSON.stringify(document, null, 2), 'utf-8')
}

export async function readApmWorkspaceSnapshotForDir(
    workingDir: string,
): Promise<WorkspacePackageSnapshot | null> {
    const document = await readLocalWorkspaceDocument(workingDir)
    if (!document) {
        const packagePerformers = await readApmPackagePerformers(workingDir)
        if (packagePerformers.performers.length === 0) return null
        return {
            workingDir,
            performers: packagePerformers.performers,
        }
    }

    const workspace = document.workspace || {}
    const packagePerformers = await readApmPackagePerformers(workingDir)
    const hasApmPackageState = packagePerformers.packageIds.length > 0 || packagePerformers.performers.length > 0

    return {
        ...workspace,
        workingDir,
        performers: hasApmPackageState
            ? mergeApmPerformersWithWorkspaceUi(packagePerformers.performers, workspace.performers)
            : workspace.performers,
    }
}

export async function writeApmPackagesForWorkspace(
    workingDir: string,
    workspace: WorkspacePackageSnapshot,
): Promise<{ packageIds: string[] }> {
    const performers = Array.isArray(workspace.performers)
        ? workspace.performers.map(normalizePerformer).filter((entry): entry is WorkspacePerformerSnapshot => !!entry)
        : []
    const packageIds = performers.map((performer) => performer.id)

    await fs.mkdir(apmStudioDir(workingDir), { recursive: true })
    for (const performer of performers) {
        await writePackageFiles(workingDir, performer.id, buildApmManifestForAgent(performer))
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

export async function activePackageIds(workingDir: string): Promise<string[] | null> {
    const document = await readLocalWorkspaceDocument(workingDir)
    if (!document) return null
    return Array.isArray(document.activePackageIds)
        ? document.activePackageIds.filter((entry): entry is string => typeof entry === 'string' && !!entry)
        : []
}

export async function packageIdsFromDisk(workingDir: string): Promise<string[]> {
    const root = await packageRootForRead(workingDir)
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

async function readApmPackagePerformers(workingDir: string): Promise<PackagePerformerRead> {
    const packageIds = await activePackageIds(workingDir) ?? await packageIdsFromDisk(workingDir)
    const performers: WorkspacePerformerSnapshot[] = []

    for (const packageId of packageIds) {
        const manifest = await readManifestFile(await manifestPathForRead(workingDir, packageId)).catch(() => null)
        const agent = manifest?.['x-apm']?.agent
        if (agent) {
            performers.push(performerFromExtension(agent, manifest))
        }
    }

    return { packageIds, performers }
}

function mergeApmPerformersWithWorkspaceUi(
    apmPerformers: WorkspacePerformerSnapshot[],
    workspacePerformers: unknown,
): Array<WorkspacePerformerSnapshot & Record<string, unknown>> {
    const workspaceById = new Map<string, Record<string, unknown>>()
    if (Array.isArray(workspacePerformers)) {
        for (const performer of workspacePerformers) {
            if (isRecord(performer) && typeof performer.id === 'string' && performer.id) {
                workspaceById.set(performer.id, performer)
            }
        }
    }

    return apmPerformers.map((performer) => {
        const workspacePerformer = workspaceById.get(performer.id)
        if (!workspacePerformer) {
            return performer
        }

        const merged: Record<string, unknown> = {
            ...workspacePerformer,
            ...performer,
        }
        for (const key of PERFORMER_UI_STATE_KEYS) {
            if (workspacePerformer[key] !== undefined) {
                merged[key] = workspacePerformer[key]
            }
        }
        return merged as WorkspacePerformerSnapshot & Record<string, unknown>
    })
}
