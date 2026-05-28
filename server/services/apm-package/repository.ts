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
import { summarizeMicrosoftApmPackageSource } from './microsoft-apm-source.js'
import { readLockFile, readManifestFile, writePackageFiles } from './package-files.js'
import {
    LOCK_FILE,
    MANIFEST_FILE,
    lockPathForRead,
    manifestPathForRead,
    sourceDirForRead,
    toPosixPath,
} from './paths.js'
import {
    activePackageIds,
    packageIdsFromDisk,
    readLocalWorkspaceDocument,
    writeLocalWorkspaceDocument,
} from './workspace.js'
import { isRecord, parseYamlRecord, readText, yamlString } from './yaml-io.js'

function extractMcpServerNames(manifest: ApmPackageManifest) {
    return Array.isArray(manifest.dependencies?.mcp)
        ? manifest.dependencies.mcp
            .map((entry) => typeof entry === 'string' ? entry : entry.name)
            .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
        : []
}

function manifestArrayLength(value: unknown) {
    return Array.isArray(value) ? value.length : 0
}

function hasModel(value: unknown) {
    return isRecord(value)
        && typeof value.modelId === 'string'
        && value.modelId.trim().length > 0
}

function agentComponentsFromManifest(manifest: ApmPackageManifest): ApmPackageSummary['agentComponents'] | undefined {
    const agent = manifest['x-apm']?.agent
    if (!agent && inferManifestKind(manifest) !== 'agent') {
        return undefined
    }

    return {
        instructions: agent?.instructionRef || agent?.talRef
            ? 1
            : manifestArrayLength(manifest.instructions),
        skills: (agent?.skillRefs || agent?.danceRefs)?.length || manifestArrayLength(manifest.skills),
        mcp: (agent?.mcpServerNames || extractMcpServerNames(manifest)).length,
        model: hasModel(agent?.model),
    }
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

async function performerFromMicrosoftApmSource(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
): Promise<WorkspacePerformerSnapshot | null> {
    const agentsDir = path.join(await sourceDirForRead(workingDir, packageId), 'agents')
    const entries = await fs.readdir(agentsDir, { withFileTypes: true }).catch(() => [])
    const agentFile = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.agent.md'))
        .map((entry) => path.join(agentsDir, entry.name))
        .sort((left, right) => left.localeCompare(right))[0]
    if (!agentFile) return null

    const parsed = parseMarkdownFrontmatter(await fs.readFile(agentFile, 'utf-8'))
    const name = parsed.data.name || manifest.name || packageId
    const modelId = parsed.data.model || ''
    const description = parsed.data.description || (typeof manifest.description === 'string' ? manifest.description : null)
    return {
        id: manifest['x-apm']?.packageId || packageId,
        name,
        model: modelId ? { provider: 'openai', modelId } : null,
        modelVariant: null,
        inlineInstruction: parsed.body || null,
        talRef: null,
        danceRefs: [],
        mcpServerNames: extractMcpServerNames(manifest),
        agentId: null,
        planMode: false,
        meta: {
            derivedFrom: `apm:${toPosixPath(path.relative(workingDir, agentFile))}`,
            ...(description ? { authoring: { description } } : {}),
        },
    }
}

async function packageSummaryFromManifest(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
): Promise<ApmPackageSummary> {
    const readableManifestPath = await manifestPathForRead(workingDir, packageId)
    const readableLockPath = await lockPathForRead(workingDir, packageId)
    const stat = await fs.stat(readableManifestPath).catch(() => null)
    const extension = manifest['x-apm']
    return {
        packageId: extension?.packageId || packageId,
        name: manifest.name,
        version: manifest.version,
        description: typeof manifest.description === 'string' ? manifest.description : undefined,
        kind: extension?.kind || 'unknown',
        agentName: extension?.agent?.agentName || extension?.agent?.performerName,
        agentComponents: agentComponentsFromManifest(manifest),
        derivedFrom: extension?.agent?.derivedFrom || null,
        manifestPath: toPosixPath(path.relative(workingDir, readableManifestPath)),
        lockPath: toPosixPath(path.relative(workingDir, readableLockPath)),
        source: 'apm',
        updatedAt: stat?.mtimeMs,
        microsoftApm: await summarizeMicrosoftApmPackageSource(workingDir, packageId, manifest),
    }
}

function inferManifestKind(manifest: ApmPackageManifest): NonNullable<ApmPackageManifest['x-apm']>['kind'] {
    if (manifest['x-apm']?.kind) return manifest['x-apm'].kind
    if (manifest.type === 'skill') return 'skill'
    if (manifest.type === 'instructions' || manifest.type === 'prompts') return 'instruction'
    if (Array.isArray(manifest.dependencies?.mcp) && manifest.dependencies.mcp.length > 0) return 'mcp'
    if (Array.isArray(manifest.agents) && manifest.agents.length > 0) return 'agent'
    return 'package'
}

export async function listApmPackages(workingDir: string): Promise<ApmPackageSummary[]> {
    const ids = await activePackageIds(workingDir) ?? await packageIdsFromDisk(workingDir)
    const summaries: ApmPackageSummary[] = []

    for (const packageId of ids) {
        const manifest = await readManifestFile(await manifestPathForRead(workingDir, packageId)).catch(() => null)
        if (!manifest) continue
        summaries.push(await packageSummaryFromManifest(workingDir, packageId, manifest))
    }

    return summaries
}

export async function readApmPackage(
    workingDir: string,
    packageId: string,
): Promise<ApmPackageReadResponse | null> {
    const manifestFile = await manifestPathForRead(workingDir, packageId)
    const lockFile = await lockPathForRead(workingDir, packageId)
    const manifestYaml = await readText(manifestFile)
    if (!manifestYaml) return null
    const manifest = parseYamlRecord<ApmPackageManifest>(manifestYaml, MANIFEST_FILE)
    const lockYaml = await readText(lockFile)
    const lock = lockYaml ? parseYamlRecord<ApmPackageLock>(lockYaml, LOCK_FILE) : undefined
    return {
        packageId: manifest['x-apm']?.packageId || packageId,
        manifest,
        lock,
        manifestYaml,
        lockYaml: lockYaml || undefined,
        microsoftApm: await summarizeMicrosoftApmPackageSource(workingDir, packageId, manifest),
    }
}

export async function writeApmPackage(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
): Promise<ApmPackageReadResponse> {
    const nextManifest: ApmPackageManifest = {
        ...manifest,
        ...(manifest['x-apm']?.agent
            ? {
                type: manifest.type || 'hybrid',
                includes: manifest.includes || 'auto',
            }
            : {}),
        'x-apm': {
            schemaVersion: 1,
            kind: inferManifestKind(manifest),
            ...manifest['x-apm'],
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
    const packageId = request.packageId || manifest['x-apm']?.packageId || manifest.name
    return writeApmPackage(workingDir, packageId, manifest)
}

export async function exportApmPackage(
    workingDir: string,
    packageId: string,
): Promise<ApmPackageExportResponse | null> {
    const manifest = await readManifestFile(await manifestPathForRead(workingDir, packageId))
    if (!manifest) return null
    const lock = await readLockFile(await lockPathForRead(workingDir, packageId)) || buildApmLockForManifest(manifest)
    return {
        packageId: manifest['x-apm']?.packageId || packageId,
        manifestYaml: yamlString(manifest),
        lockYaml: yamlString(lock),
        manifestPath: toPosixPath(path.relative(workingDir, await manifestPathForRead(workingDir, packageId))),
        lockPath: toPosixPath(path.relative(workingDir, await lockPathForRead(workingDir, packageId))),
        microsoftApm: await summarizeMicrosoftApmPackageSource(workingDir, packageId, manifest),
    }
}

export async function listApmAgentProjectionSnapshots(
    workingDir: string,
): Promise<WorkspacePerformerSnapshot[]> {
    const ids = await activePackageIds(workingDir) ?? await packageIdsFromDisk(workingDir)
    const performers: WorkspacePerformerSnapshot[] = []
    for (const packageId of ids) {
        const manifest = await readManifestFile(await manifestPathForRead(workingDir, packageId)).catch(() => null)
        const agent = manifest?.['x-apm']?.agent
        if (agent) {
            const extensionPerformer = performerFromExtension(agent, manifest)
            const sourcePerformer = manifest
                ? await performerFromMicrosoftApmSource(workingDir, packageId, manifest)
                : null
            performers.push(sourcePerformer
                ? {
                    ...extensionPerformer,
                    inlineInstruction: sourcePerformer.inlineInstruction || extensionPerformer.inlineInstruction,
                    meta: sourcePerformer.meta || extensionPerformer.meta,
                }
                : extensionPerformer)
            continue
        }
        if (manifest) {
            const sourcePerformer = await performerFromMicrosoftApmSource(workingDir, packageId, manifest)
            if (sourcePerformer) {
                performers.push(sourcePerformer)
            }
        }
    }
    if (performers.length > 0) {
        return performers
    }

    return []
}
