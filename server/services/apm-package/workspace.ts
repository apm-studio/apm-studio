import fs from 'fs/promises'
import type { WorkspacePerformerSnapshot } from '../workspace-service.js'
import { buildApmManifestForAgent, normalizePerformer } from './manifest.js'
import { writePackageFiles } from './package-files.js'
import { eightPmDir, localWorkspacePath, packageRoot } from './paths.js'
import type { EightPmWorkspaceDocument, WorkspacePackageSnapshot } from './types.js'
import { isErrnoException, isRecord, readText } from './yaml-io.js'

export async function readLocalWorkspaceDocument(
    workingDir: string,
): Promise<EightPmWorkspaceDocument | null> {
    const raw = await readText(localWorkspacePath(workingDir))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.workspace)) {
        return null
    }
    return parsed as EightPmWorkspaceDocument
}

export async function writeLocalWorkspaceDocument(
    workingDir: string,
    document: EightPmWorkspaceDocument,
) {
    await fs.writeFile(localWorkspacePath(workingDir), JSON.stringify(document, null, 2), 'utf-8')
}

export async function readEightPmWorkspaceSnapshotForDir(
    workingDir: string,
): Promise<WorkspacePackageSnapshot | null> {
    return (await readLocalWorkspaceDocument(workingDir))?.workspace || null
}

export async function writeApmPackagesForWorkspace(
    workingDir: string,
    workspace: WorkspacePackageSnapshot,
): Promise<{ packageIds: string[] }> {
    const performers = Array.isArray(workspace.performers)
        ? workspace.performers.map(normalizePerformer).filter((entry): entry is WorkspacePerformerSnapshot => !!entry)
        : []
    const packageIds = performers.map((performer) => performer.id)

    await fs.mkdir(eightPmDir(workingDir), { recursive: true })
    await writeLocalWorkspaceDocument(workingDir, {
        schemaVersion: 1,
        product: '8PM Studio',
        workingDir,
        savedAt: Date.now(),
        activePackageIds: packageIds,
        workspace: {
            ...workspace,
            workingDir,
        },
    })

    for (const performer of performers) {
        await writePackageFiles(workingDir, performer.id, buildApmManifestForAgent(performer))
    }

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
