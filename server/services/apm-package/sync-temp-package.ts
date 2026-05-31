import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type {
    ApmPackageManifest,
} from '../../../shared/apm-contracts.js'
import type { ApmSyncUnit } from '../../../shared/apm-sync-contracts.js'
import { readManifestFile } from './package-files.js'
import {
    manifestPath,
    sourceDir,
} from './paths.js'
import { loadStudioFallbackSyncPackage } from './studio-fallback-package.js'
import { yamlString } from './yaml-io.js'

export type SyncTempPackage = {
    rootDir: string
    workspaceDir: string
    homeDir: string
    packageRoot: string
}

export function filteredManifestForSync(manifest: ApmPackageManifest, syncUnit: ApmSyncUnit): ApmPackageManifest {
    const includeMcp = syncUnit === 'studio-agent' || syncUnit === 'mcp'
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
        case 'prompts':
        case 'commands':
            return 'prompts'
        case 'hooks':
            return 'hooks'
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

function markdownFrontmatter(fields: Record<string, unknown>) {
    const yaml = yamlString(Object.fromEntries(
        Object.entries(fields).filter(([, value]) => {
            if (value === null || value === undefined) return false
            if (Array.isArray(value) && value.length === 0) return false
            return true
        }),
    )).trimEnd()
    return `---\n${yaml}\n---`
}

async function writeStudioAgentTempPackage(
    workingDir: string,
    packageId: string,
    packageRoot: string,
) {
    const manifest = await readManifestFile(manifestPath(workingDir, packageId))
    if (!manifest) {
        throw new Error(`Unable to read APM package manifest for ${packageId}.`)
    }
    const syncPackage = await loadStudioFallbackSyncPackage(workingDir, packageId)
    if (!syncPackage?.hasAgent) {
        throw new Error(`Package ${packageId} does not contain a Studio Agent.`)
    }

    await fs.mkdir(path.join(packageRoot, '.apm', 'agents'), { recursive: true })
    await fs.writeFile(
        path.join(packageRoot, 'apm.yml'),
        yamlString(filteredManifestForSync(manifest, 'studio-agent')),
        'utf-8',
    )
    await fs.writeFile(
        path.join(packageRoot, '.apm', 'agents', `${syncPackage.slug}.agent.md`),
        `${markdownFrontmatter({
            name: syncPackage.slug,
            description: syncPackage.description,
        })}\n\n${syncPackage.instruction.trimEnd()}\n`,
        'utf-8',
    )
    await copyIfExists(
        path.join(sourceDir(workingDir, packageId), 'skills'),
        path.join(packageRoot, '.apm', 'skills'),
    )
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

    if (syncUnit === 'studio-agent') {
        await fs.mkdir(packageRoot, { recursive: true })
        await writeStudioAgentTempPackage(workingDir, packageId, packageRoot)
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
