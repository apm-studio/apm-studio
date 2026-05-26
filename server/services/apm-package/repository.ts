import fs from 'fs/promises'
import path from 'path'
import type {
    ApmPackageExportResponse,
    ApmPackageImportRequest,
    ApmPackageLock,
    ApmPackageManifest,
    ApmPackageReadResponse,
    ApmPackageSummary,
} from '../../../shared/apm-contracts.js'
import type { WorkspacePerformerSnapshot } from '../workspace-service.js'
import {
    buildApmLockForManifest,
    performerFromExtension,
} from './manifest.js'
import { readLockFile, readManifestFile, writePackageFiles } from './package-files.js'
import { LOCK_FILE, MANIFEST_FILE, lockPath, manifestPath, toPosixPath } from './paths.js'
import {
    activePackageIds,
    packageIdsFromDisk,
    readLocalWorkspaceDocument,
    writeLocalWorkspaceDocument,
} from './workspace.js'
import { parseYamlRecord, readText, yamlString } from './yaml-io.js'

async function packageSummaryFromManifest(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
): Promise<ApmPackageSummary> {
    const stat = await fs.stat(manifestPath(workingDir, packageId)).catch(() => null)
    const extension = manifest['x-8pm']
    return {
        packageId: extension?.packageId || packageId,
        name: manifest.name,
        version: manifest.version,
        description: typeof manifest.description === 'string' ? manifest.description : undefined,
        kind: extension?.kind || 'unknown',
        agentName: extension?.agent?.performerName,
        derivedFrom: extension?.agent?.derivedFrom || null,
        manifestPath: toPosixPath(path.relative(workingDir, manifestPath(workingDir, packageId))),
        lockPath: toPosixPath(path.relative(workingDir, lockPath(workingDir, packageId))),
        source: 'apm',
        updatedAt: stat?.mtimeMs,
    }
}

export async function listApmPackages(workingDir: string): Promise<ApmPackageSummary[]> {
    const ids = await activePackageIds(workingDir) ?? await packageIdsFromDisk(workingDir)
    const summaries: ApmPackageSummary[] = []

    for (const packageId of ids) {
        const manifest = await readManifestFile(manifestPath(workingDir, packageId)).catch(() => null)
        if (!manifest) continue
        summaries.push(await packageSummaryFromManifest(workingDir, packageId, manifest))
    }

    return summaries
}

export async function readApmPackage(
    workingDir: string,
    packageId: string,
): Promise<ApmPackageReadResponse | null> {
    const manifestFile = manifestPath(workingDir, packageId)
    const lockFile = lockPath(workingDir, packageId)
    const manifestYaml = await readText(manifestFile)
    if (!manifestYaml) return null
    const manifest = parseYamlRecord<ApmPackageManifest>(manifestYaml, MANIFEST_FILE)
    const lockYaml = await readText(lockFile)
    const lock = lockYaml ? parseYamlRecord<ApmPackageLock>(lockYaml, LOCK_FILE) : undefined
    return {
        packageId: manifest['x-8pm']?.packageId || packageId,
        manifest,
        lock,
        manifestYaml,
        lockYaml: lockYaml || undefined,
    }
}

export async function writeApmPackage(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
): Promise<ApmPackageReadResponse> {
    const nextManifest: ApmPackageManifest = {
        ...manifest,
        'x-8pm': {
            schemaVersion: 1,
            kind: manifest['x-8pm']?.kind || 'agent',
            ...manifest['x-8pm'],
            packageId,
        },
    }
    await writePackageFiles(workingDir, packageId, nextManifest)

    const document = await readLocalWorkspaceDocument(workingDir)
    if (document && !document.activePackageIds.includes(packageId)) {
        document.activePackageIds.push(packageId)
        await writeLocalWorkspaceDocument(workingDir, document)
    }

    const readBack = await readApmPackage(workingDir, packageId)
    if (!readBack) {
        throw new Error('APM package write did not produce a readable manifest.')
    }
    return readBack
}

export async function importApmPackage(
    workingDir: string,
    request: ApmPackageImportRequest,
): Promise<ApmPackageReadResponse> {
    const manifest = request.manifest
        || (request.manifestYaml ? parseYamlRecord<ApmPackageManifest>(request.manifestYaml, MANIFEST_FILE) : null)
    if (!manifest) {
        throw new Error('manifest or manifestYaml is required.')
    }
    const packageId = request.packageId || manifest['x-8pm']?.packageId || manifest.name
    return writeApmPackage(workingDir, packageId, manifest)
}

export async function exportApmPackage(
    workingDir: string,
    packageId: string,
): Promise<ApmPackageExportResponse | null> {
    const manifest = await readManifestFile(manifestPath(workingDir, packageId))
    if (!manifest) return null
    const lock = await readLockFile(lockPath(workingDir, packageId)) || buildApmLockForManifest(manifest)
    return {
        packageId: manifest['x-8pm']?.packageId || packageId,
        manifestYaml: yamlString(manifest),
        lockYaml: yamlString(lock),
        manifestPath: toPosixPath(path.relative(workingDir, manifestPath(workingDir, packageId))),
        lockPath: toPosixPath(path.relative(workingDir, lockPath(workingDir, packageId))),
    }
}

export async function listApmAgentProjectionSnapshots(
    workingDir: string,
): Promise<WorkspacePerformerSnapshot[]> {
    const ids = await activePackageIds(workingDir) ?? await packageIdsFromDisk(workingDir)
    const performers: WorkspacePerformerSnapshot[] = []
    for (const packageId of ids) {
        const manifest = await readManifestFile(manifestPath(workingDir, packageId)).catch(() => null)
        const agent = manifest?.['x-8pm']?.agent
        if (agent) {
            performers.push(performerFromExtension(agent, manifest))
        }
    }
    if (performers.length > 0) {
        return performers
    }

    return []
}
