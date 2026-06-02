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

function normalizeDependencyRef(value: unknown) {
    if (typeof value !== 'string') return null
    const normalized = toPosixPath(value.trim()).replace(/^\.\//, '')
    return normalized || null
}

function dependencyMatchesPackage(entry: ApmDependency, packageRef: string, packageId: string) {
    const normalizedPackageRef = normalizeDependencyRef(packageRef)
    const normalizedPackageId = normalizeDependencyRef(packageId)
    const matches = (value: unknown) => {
        const normalized = normalizeDependencyRef(value)
        return !!normalized && (
            normalized === normalizedPackageRef
            || normalized === normalizedPackageId
        )
    }

    if (matches(entry)) return true
    if (!isRecord(entry)) return false
    return matches(entry.path) || matches(entry.name)
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

    if (!currentApmDeps.some((entry) => dependencyMatchesPackage(entry, packageRef, packageId))) {
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

export async function removeRootApmPackageDependency(
    workingDir: string,
    packageId: string,
) {
    const manifestPath = path.join(workingDir, MANIFEST_FILE)
    const raw = await readText(manifestPath)
    if (!raw) return

    const manifest = parseYamlRecord<ApmPackageManifest>(raw, MANIFEST_FILE)
    const packageRef = packageDependencyRef(workingDir, packageId)
    const dependencies = isRecord(manifest.dependencies)
        ? { ...manifest.dependencies }
        : {}
    const currentApmDeps = apmDependencies(manifest)
    const nextApmDeps = currentApmDeps.filter((entry) => !dependencyMatchesPackage(entry, packageRef, packageId))

    dependencies.apm = nextApmDeps
    const nextManifest: ApmPackageManifest = {
        ...manifest,
        dependencies,
    }

    await fs.writeFile(manifestPath, yamlString(nextManifest), 'utf-8')
}
