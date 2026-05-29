import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type {
    ApmPackageManifest,
    ApmSyncUnit,
} from '../../../shared/apm-contracts.js'
import { readManifestFile } from './package-files.js'
import {
    manifestPath,
    packageDir,
    sourceDir,
} from './paths.js'
import { yamlString } from './yaml-io.js'

export type SyncTempPackage = {
    rootDir: string
    workspaceDir: string
    homeDir: string
    packageRoot: string
}

export function filteredManifestForSync(manifest: ApmPackageManifest, syncUnit: ApmSyncUnit): ApmPackageManifest {
    const includeMcp = syncUnit === 'agent-packages' || syncUnit === 'mcp'
    return {
        name: manifest.name,
        version: manifest.version || '0.1.0',
        ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
        type: manifest.type || 'hybrid',
        includes: 'auto',
        dependencies: {
            apm: [],
            mcp: includeMcp && Array.isArray(manifest.dependencies?.mcp)
                ? manifest.dependencies.mcp
                : [],
        },
        scripts: {},
    }
}

function primitiveDirName(syncUnit: ApmSyncUnit) {
    switch (syncUnit) {
        case 'agents':
            return 'agents'
        case 'instructions':
            return 'instructions'
        case 'skills':
            return 'skills'
        default:
            return null
    }
}

async function copyIfExists(source: string, target: string) {
    const stat = await fs.stat(source).catch(() => null)
    if (!stat) return false
    await fs.cp(source, target, { recursive: true, force: true })
    return true
}

export async function createSyncTempPackage(
    workingDir: string,
    packageId: string,
    syncUnit: ApmSyncUnit,
): Promise<SyncTempPackage> {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-sync-'))
    const workspaceDir = path.join(rootDir, 'workspace')
    const homeDir = path.join(rootDir, 'home')
    const packageRoot = path.join(rootDir, 'package')
    await Promise.all([
        fs.mkdir(workspaceDir, { recursive: true }),
        fs.mkdir(homeDir, { recursive: true }),
    ])

    if (syncUnit === 'agent-packages') {
        await fs.cp(packageDir(workingDir, packageId), packageRoot, {
            recursive: true,
            force: true,
        })
        return { rootDir, workspaceDir, homeDir, packageRoot }
    }

    const manifest = await readManifestFile(manifestPath(workingDir, packageId))
    if (!manifest) {
        throw new Error(`Unable to read APM package manifest for ${packageId}.`)
    }
    await fs.mkdir(packageRoot, { recursive: true })
    await fs.writeFile(path.join(packageRoot, 'apm.yml'), yamlString(filteredManifestForSync(manifest, syncUnit)), 'utf-8')

    const dirName = primitiveDirName(syncUnit)
    if (dirName) {
        await copyIfExists(
            path.join(sourceDir(workingDir, packageId), dirName),
            path.join(packageRoot, '.apm', dirName),
        )
    }
    return { rootDir, workspaceDir, homeDir, packageRoot }
}

export async function removeSyncTempPackage(tempPackage: Pick<SyncTempPackage, 'rootDir'>) {
    await fs.rm(tempPackage.rootDir, { recursive: true, force: true }).catch(() => {})
}
