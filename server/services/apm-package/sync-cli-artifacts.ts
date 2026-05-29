import fs from 'fs/promises'
import path from 'path'
import type {
    ApmSyncTargetId,
    ApmSyncUnit,
} from '../../../shared/apm-contracts.js'
import { toPosixPath } from './paths.js'
import {
    readSyncOwnershipManifest,
    writeManagedSyncFile,
    writeSyncOwnershipManifest,
} from './sync-ownership.js'
import { syncTargetProfile } from './sync-targets.js'
import type { SyncTempPackage } from './sync-temp-package.js'

async function walkFiles(dir: string): Promise<string[]> {
    const files: string[] = []
    async function walk(current: string) {
        const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
            const next = path.join(current, entry.name)
            if (entry.isDirectory()) {
                await walk(next)
            } else if (entry.isFile()) {
                files.push(next)
            }
        }
    }
    await walk(dir)
    return files.sort((left, right) => left.localeCompare(right))
}

export async function collectCliArtifacts(tempWorkspace: string, target: ApmSyncTargetId) {
    const profile = syncTargetProfile(target)
    const artifacts: string[] = []
    for (const root of profile.artifactRoots) {
        const absoluteRoot = path.join(tempWorkspace, root)
        const files = await walkFiles(absoluteRoot)
        artifacts.push(...files.map((filePath) => toPosixPath(path.relative(tempWorkspace, filePath))))
    }
    for (const file of profile.projectArtifactFiles || []) {
        const absolutePath = path.join(tempWorkspace, file)
        const stat = await fs.stat(absolutePath).catch(() => null)
        if (stat?.isFile()) artifacts.push(toPosixPath(file))
    }
    return Array.from(new Set(artifacts)).sort((left, right) => left.localeCompare(right))
}

export async function applyCliArtifacts(
    tempPackage: SyncTempPackage,
    workingDir: string,
    packageId: string,
    target: ApmSyncTargetId,
    syncUnit: ApmSyncUnit,
) {
    const relativeArtifacts = await collectCliArtifacts(tempPackage.workspaceDir, target)
    const ownership = await readSyncOwnershipManifest(workingDir)
    const context = {
        workingDir,
        packageId,
        target,
        syncUnit,
        source: 'apm-cli' as const,
        ownership,
    }
    const written: string[] = []
    for (const artifact of relativeArtifacts) {
        const content = await fs.readFile(path.join(tempPackage.workspaceDir, artifact))
        written.push(await writeManagedSyncFile(artifact, content, context))
    }
    await writeSyncOwnershipManifest(workingDir, ownership)
    return written
}
