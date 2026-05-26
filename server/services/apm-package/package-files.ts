import fs from 'fs/promises'
import type { ApmPackageLock, ApmPackageManifest } from '../../../shared/apm-contracts.js'
import { buildApmLockForManifest, validateApmPackageManifest } from './manifest.js'
import { LOCK_FILE, MANIFEST_FILE, lockPath, manifestPath, packageDir } from './paths.js'
import { parseYamlRecord, readText, yamlString } from './yaml-io.js'

export async function readManifestFile(filePath: string): Promise<ApmPackageManifest | null> {
    const raw = await readText(filePath)
    if (!raw) return null
    return parseYamlRecord<ApmPackageManifest>(raw, MANIFEST_FILE)
}

export async function readLockFile(filePath: string): Promise<ApmPackageLock | null> {
    const raw = await readText(filePath)
    if (!raw) return null
    return parseYamlRecord<ApmPackageLock>(raw, LOCK_FILE)
}

export async function writePackageFiles(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
) {
    const validation = validateApmPackageManifest(manifest)
    if (!validation.valid) {
        throw new Error(validation.errors.join(' '))
    }

    const dir = packageDir(workingDir, packageId)
    await fs.mkdir(dir, { recursive: true })
    const lock = buildApmLockForManifest(manifest)
    await fs.writeFile(manifestPath(workingDir, packageId), yamlString(manifest), 'utf-8')
    await fs.writeFile(lockPath(workingDir, packageId), yamlString(lock), 'utf-8')
    return { manifest, lock }
}
