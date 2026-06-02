import fs from 'fs/promises'
import path from 'path'
import type {
    ApmPackageLock,
    ApmPackageLockStatus,
    ApmPackageManifest,
    ApmPackageReadResponse,
    ApmPrimitiveFileKind,
    ApmPrimitiveFileListResponse,
    ApmPrimitiveFileReadResponse,
    ApmPrimitiveFileSummary,
} from '../../../shared/apm-contracts.js'
import { buildApmLockForManifest } from './manifest.js'
import { hashManifest, hashStructuredValue, hashText } from './manifest-hash.js'
import { readManifestFile, writePackageFiles } from './package-files.js'
import { LOCK_FILE, MANIFEST_FILE, lockPath, manifestPath, packageDir, toPosixPath } from './paths.js'
import { isRecord, parseYamlRecord, readText, yamlString } from './yaml-io.js'

export class ApmPackageConflictError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ApmPackageConflictError'
    }
}

type LockReadDetails = {
    lock?: ApmPackageLock
    lockYaml?: string
    lockStatus: ApmPackageLockStatus
}

type PrimitiveFileDescriptor = {
    path: string
    kind: ApmPrimitiveFileKind
    label: string
    syncsToManifest: boolean
    readonlyReason?: string
}

function parseMarkdownFrontmatter(raw: string) {
    const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    if (lines[0]?.trim() !== '---') {
        return { data: {}, body: normalized.trim() }
    }
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end < 0) {
        return { data: {}, body: normalized.trim() }
    }
    const data: Record<string, string> = {}
    for (const line of lines.slice(1, end)) {
        const match = line.match(/^([^:#]+):\s*(.*)$/)
        if (!match) continue
        data[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    }
    return {
        data,
        body: lines.slice(end + 1).join('\n').trim(),
    }
}

function lockManifestHash(lock: ApmPackageLock | undefined, packageId: string) {
    const entries = Array.isArray(lock?.packages) ? lock.packages : []
    return entries.find((entry) => entry.package_id === packageId)?.manifest_hash
        || entries[0]?.manifest_hash
}

export function buildPackageLockStatus(
    manifest: ApmPackageManifest,
    packageId: string,
    lock: ApmPackageLock | undefined,
    parseError?: string,
): ApmPackageLockStatus {
    const manifestHash = hashManifest(manifest)
    if (parseError) {
        return {
            state: 'invalid',
            manifestHash,
            message: parseError,
        }
    }
    if (!lock) {
        return {
            state: 'missing',
            manifestHash,
            message: `${LOCK_FILE} is missing.`,
        }
    }
    const lockHash = lockManifestHash(lock, packageId)
    if (!lockHash) {
        return {
            state: 'invalid',
            manifestHash,
            message: `${LOCK_FILE} does not record a package manifest hash.`,
        }
    }
    if (lockHash !== manifestHash) {
        return {
            state: 'stale',
            manifestHash,
            lockManifestHash: lockHash,
            message: `${LOCK_FILE} does not match the current manifest.`,
        }
    }
    return {
        state: 'current',
        manifestHash,
        lockManifestHash: lockHash,
        message: `${LOCK_FILE} matches the current manifest.`,
    }
}

export async function readPackageLockDetails(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
): Promise<LockReadDetails> {
    const raw = await readText(lockPath(workingDir, packageId))
    if (!raw) {
        return {
            lockStatus: buildPackageLockStatus(manifest, packageId, undefined),
        }
    }
    try {
        const lock = parseYamlRecord<ApmPackageLock>(raw, LOCK_FILE)
        return {
            lock,
            lockYaml: raw,
            lockStatus: buildPackageLockStatus(manifest, packageId, lock),
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : `Unable to parse ${LOCK_FILE}.`
        return {
            lockYaml: raw,
            lockStatus: buildPackageLockStatus(manifest, packageId, undefined, message),
        }
    }
}

function normalizePackageRelativePath(value: string) {
    const normalized = toPosixPath(value.trim()).replace(/^\.\//, '')
    if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
        throw new Error('Primitive path is invalid.')
    }
    const parts = normalized.split('/')
    if (parts.some((part) => part === '..' || part === '')) {
        throw new Error('Primitive path must stay inside the package.')
    }
    return normalized
}

function primitiveKindForPath(relativePath: string, manifest: ApmPackageManifest): ApmPrimitiveFileKind | null {
    if (relativePath.startsWith('.apm/agents/') && relativePath.endsWith('.agent.md')) return 'agent'
    if (relativePath.startsWith('.apm/instructions/') && relativePath.endsWith('.instructions.md')) return 'instruction'
    if (relativePath.startsWith('.apm/skills/') && relativePath.endsWith('/SKILL.md')) return 'skill'
    if (relativePath.startsWith('.apm/prompts/') && relativePath.endsWith('.prompt.md')) {
        return manifest['x-apm']?.kind === 'command' || manifest.type === 'commands' ? 'command' : 'prompt'
    }
    if (relativePath.startsWith('.apm/hooks/') && relativePath.endsWith('.json')) return 'hook'
    return null
}

function primitiveLabel(relativePath: string, kind: ApmPrimitiveFileKind) {
    if (kind === 'skill') {
        return relativePath.split('/').slice(-2, -1)[0] || 'SKILL.md'
    }
    const filename = relativePath.split('/').at(-1) || relativePath
    return filename
        .replace(/\.agent\.md$/, '')
        .replace(/\.instructions\.md$/, '')
        .replace(/\.prompt\.md$/, '')
        .replace(/\.json$/, '')
}

function isPrimaryManagedAgentFile(relativePath: string, manifest: ApmPackageManifest, sourcePaths: string[]) {
    return !!manifest['x-apm']?.agent
        && primitiveKindForPath(relativePath, manifest) === 'agent'
        && sourcePaths.filter((entry) => primitiveKindForPath(entry, manifest) === 'agent').length === 1
}

function descriptorForPrimitive(
    relativePath: string,
    manifest: ApmPackageManifest,
    sourcePaths: string[],
): PrimitiveFileDescriptor | null {
    const kind = primitiveKindForPath(relativePath, manifest)
    if (!kind) return null
    const managedAgent = !!manifest['x-apm']?.agent
    const primaryManagedAgent = isPrimaryManagedAgentFile(relativePath, manifest, sourcePaths)
    if (managedAgent && !primaryManagedAgent) {
        return {
            path: relativePath,
            kind,
            label: primitiveLabel(relativePath, kind),
            readonlyReason: 'This file is generated from Studio-managed manifest data and package references.',
            syncsToManifest: false,
        }
    }
    return {
        path: relativePath,
        kind,
        label: primitiveLabel(relativePath, kind),
        readonlyReason: primaryManagedAgent
            ? 'Edit this Agent source file in your local editor, then refresh Studio to sync it back to apm.yml.'
            : 'Edit this primitive source file in your local editor, then refresh Studio.',
        syncsToManifest: primaryManagedAgent,
    }
}

async function discoverSourcePaths(root: string) {
    const sourceRoot = path.join(root, '.apm')
    const result: string[] = []
    async function walk(current: string) {
        const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
            const next = path.join(current, entry.name)
            if (entry.isDirectory()) {
                await walk(next)
            } else if (entry.isFile()) {
                result.push(toPosixPath(path.relative(root, next)))
            }
        }
    }
    await walk(sourceRoot)
    return result.sort((left, right) => left.localeCompare(right))
}

async function primitiveSummary(
    root: string,
    descriptor: PrimitiveFileDescriptor,
): Promise<ApmPrimitiveFileSummary> {
    const absolutePath = path.join(root, descriptor.path)
    const [content, stat] = await Promise.all([
        fs.readFile(absolutePath, 'utf-8'),
        fs.stat(absolutePath),
    ])
    return {
        path: descriptor.path,
        kind: descriptor.kind,
        label: descriptor.label,
        hash: hashText(content),
        updatedAt: stat.mtimeMs,
        size: stat.size,
        readonlyReason: descriptor.readonlyReason,
    }
}

function sourceTreeHash(files: ApmPrimitiveFileSummary[]) {
    return hashStructuredValue(files.map((file) => ({
        path: file.path,
        hash: file.hash,
    })))
}

export async function listApmPackagePrimitiveFiles(
    workingDir: string,
    packageId: string,
): Promise<ApmPrimitiveFileListResponse> {
    const manifest = await readManifestFile(manifestPath(workingDir, packageId))
    if (!manifest) {
        throw new Error('APM package not found.')
    }
    const root = packageDir(workingDir, packageId)
    const sourcePaths = await discoverSourcePaths(root)
    const descriptors = sourcePaths
        .map((relativePath) => descriptorForPrimitive(relativePath, manifest, sourcePaths))
        .filter((descriptor): descriptor is PrimitiveFileDescriptor => !!descriptor)
    const files = await Promise.all(descriptors.map((descriptor) => primitiveSummary(root, descriptor)))
    return {
        packageId: manifest['x-apm']?.packageId || packageId,
        sourceTreeHash: sourceTreeHash(files),
        files,
    }
}

async function descriptorForRequestedPath(
    workingDir: string,
    packageId: string,
    requestedPath: string,
) {
    const manifest = await readManifestFile(manifestPath(workingDir, packageId))
    if (!manifest) {
        throw new Error('APM package not found.')
    }
    const root = packageDir(workingDir, packageId)
    const relativePath = normalizePackageRelativePath(requestedPath)
    const sourcePaths = await discoverSourcePaths(root)
    const descriptor = descriptorForPrimitive(relativePath, manifest, sourcePaths)
    if (!descriptor) {
        throw new Error('Primitive file type is not supported for Studio preview.')
    }
    const absolutePath = path.resolve(root, relativePath)
    const rootPath = path.resolve(root)
    if (!absolutePath.startsWith(`${rootPath}${path.sep}`)) {
        throw new Error('Primitive path must stay inside the package.')
    }
    await fs.access(absolutePath)
    return { manifest, root, descriptor, absolutePath }
}

export async function readApmPackagePrimitiveFile(
    workingDir: string,
    packageId: string,
    requestedPath: string,
): Promise<ApmPrimitiveFileReadResponse> {
    const { root, descriptor, absolutePath } = await descriptorForRequestedPath(workingDir, packageId, requestedPath)
    const summary = await primitiveSummary(root, descriptor)
    const content = await fs.readFile(absolutePath, 'utf-8')
    return {
        ...summary,
        content,
    }
}

function updateManifestAgentBody(manifest: ApmPackageManifest, body: string): ApmPackageManifest {
    const extension = manifest['x-apm']
    const agent = extension?.agent
    if (!extension || !agent) {
        throw new Error('This package does not have Studio-managed agent metadata.')
    }

    const nextManifest: ApmPackageManifest = {
        ...manifest,
        agents: Array.isArray(manifest.agents)
            ? manifest.agents.map((entry, index) => {
                if (index !== 0 || !isRecord(entry)) return entry
                return {
                    ...entry,
                    instruction: {
                        source: 'inline',
                        content: body,
                    },
                }
            })
            : manifest.agents,
        'x-apm': {
            ...extension,
            agent: {
                ...agent,
                agentBody: body,
            },
        },
    }
    return nextManifest
}

export async function syncManagedApmPackageSourceToManifest(
    workingDir: string,
    packageId: string,
    readPackage: (workingDir: string, packageId: string) => Promise<ApmPackageReadResponse | null>,
) {
    const manifest = await readManifestFile(manifestPath(workingDir, packageId))
    if (!manifest?.['x-apm']?.agent) {
        return { synced: false, package: await readPackage(workingDir, packageId) }
    }

    const root = packageDir(workingDir, packageId)
    const sourcePaths = await discoverSourcePaths(root)
    const managedAgentPath = sourcePaths.find((relativePath) => {
        const descriptor = descriptorForPrimitive(relativePath, manifest, sourcePaths)
        return descriptor?.syncsToManifest === true
    })
    if (!managedAgentPath) {
        return { synced: false, package: await readPackage(workingDir, packageId) }
    }

    const content = await fs.readFile(path.join(root, managedAgentPath), 'utf-8')
    const parsed = parseMarkdownFrontmatter(content)
    const description = typeof parsed.data.description === 'string' && parsed.data.description.trim()
        ? parsed.data.description.trim()
        : undefined
    const currentAgent = manifest['x-apm'].agent
    const currentBody = typeof currentAgent.agentBody === 'string' ? currentAgent.agentBody.trim() : ''
    const nextBody = parsed.body.trim()
    const nextDescription = description || currentAgent.description || undefined
    const descriptionChanged = description !== undefined && description !== currentAgent.description
    if (currentBody === nextBody && !descriptionChanged) {
        return { synced: false, package: await readPackage(workingDir, packageId) }
    }

    await writePackageFiles(workingDir, packageId, updateManifestAgentBody({
        ...manifest,
        ...(nextDescription ? { description: nextDescription } : {}),
        'x-apm': {
            ...manifest['x-apm'],
            agent: {
                ...currentAgent,
                ...(nextDescription ? { description: nextDescription } : {}),
            },
        },
    }, nextBody))
    return { synced: true, package: await readPackage(workingDir, packageId) }
}

export async function computeApmPackageSourceTreeHash(workingDir: string, packageId: string) {
    return (await listApmPackagePrimitiveFiles(workingDir, packageId).catch(() => null))?.sourceTreeHash
}

export async function regenerateApmPackageLock(
    workingDir: string,
    packageId: string,
    baseManifestHash?: string,
    readPackage?: (workingDir: string, packageId: string) => Promise<ApmPackageReadResponse | null>,
) {
    const manifestFile = manifestPath(workingDir, packageId)
    const manifestYaml = await readText(manifestFile)
    if (!manifestYaml) {
        throw new Error('APM package not found.')
    }
    const manifest = parseYamlRecord<ApmPackageManifest>(manifestYaml, MANIFEST_FILE)
    const currentHash = hashManifest(manifest)
    if (baseManifestHash && baseManifestHash !== currentHash) {
        throw new ApmPackageConflictError('Manifest changed on disk. Refresh before regenerating the lock.')
    }
    const lock = buildApmLockForManifest(manifest)
    await fs.writeFile(lockPath(workingDir, packageId), yamlString(lock), 'utf-8')
    if (readPackage) {
        const readBack = await readPackage(workingDir, packageId)
        if (readBack) return readBack
    }
    return null
}
