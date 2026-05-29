import fs from 'fs/promises'
import path from 'path'
import type { ApmDependency, ApmPackageManifest } from '../../../shared/apm-contracts.js'
import { MANIFEST_FILE, packageDir, toPosixPath } from './paths.js'
import { isRecord, parseYamlRecord, readText, yamlString } from './yaml-io.js'

function defaultWorkspaceName(workingDir: string) {
    return path.basename(path.resolve(workingDir)) || 'apm-workspace'
}

function packageDependencyRef(workingDir: string, packageId: string) {
    const relativePath = toPosixPath(path.relative(workingDir, packageDir(workingDir, packageId)))
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

function isApmDependency(entry: unknown): entry is ApmDependency {
    return typeof entry === 'string' || isRecord(entry)
}

function apmDependencies(manifest: ApmPackageManifest): ApmDependency[] {
    const dependencies = isRecord(manifest.dependencies) ? manifest.dependencies : {}
    return Array.isArray(dependencies.apm) ? dependencies.apm.filter(isApmDependency) : []
}

function dependencyMatchesPackage(entry: ApmDependency, packageRef: string) {
    if (entry === packageRef) return true
    if (!isRecord(entry)) return false
    return entry.path === packageRef || entry.name === packageRef
}

export async function ensureRootApmPackageDependency(
    workingDir: string,
    packageId: string,
) {
    const manifestPath = path.join(workingDir, MANIFEST_FILE)
    const raw = await readText(manifestPath)
    const manifest: ApmPackageManifest = raw
        ? parseYamlRecord<ApmPackageManifest>(raw, MANIFEST_FILE)
        : {
            name: defaultWorkspaceName(workingDir),
            version: '1.0.0',
            includes: 'auto',
            dependencies: {
                apm: [],
                mcp: [],
            },
        }
    const packageRef = packageDependencyRef(workingDir, packageId)
    const dependencies = isRecord(manifest.dependencies)
        ? { ...manifest.dependencies }
        : {}
    const currentApmDeps = apmDependencies(manifest)

    if (!currentApmDeps.some((entry) => dependencyMatchesPackage(entry, packageRef))) {
        dependencies.apm = [...currentApmDeps, packageRef]
    } else {
        dependencies.apm = currentApmDeps
    }
    if (!Array.isArray(dependencies.mcp)) {
        dependencies.mcp = []
    }

    const nextManifest: ApmPackageManifest = {
        ...manifest,
        name: manifest.name || defaultWorkspaceName(workingDir),
        version: manifest.version || '1.0.0',
        includes: manifest.includes || 'auto',
        dependencies,
    }

    await fs.mkdir(workingDir, { recursive: true })
    await fs.writeFile(manifestPath, yamlString(nextManifest), 'utf-8')
}
