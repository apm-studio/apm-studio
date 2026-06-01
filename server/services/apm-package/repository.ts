import fs from 'fs/promises'
import path from 'path'
import type {
    ApmPackageImportRequest,
    ApmPackageLock,
    ApmPackageManifest,
    ApmPackageReadResponse,
    ApmPackageSummary,
} from '../../../shared/apm-contracts.js'
import type { WorkspaceAgentSnapshot } from '../../../shared/workspace-contracts.js'
import { agentFromExtension } from './manifest-agent-normalization.js'
import { summarizeMicrosoftApmPackageSource } from './microsoft-apm-source.js'
import { readManifestFile, writePackageFiles } from './package-files.js'
import {
    LOCK_FILE,
    MANIFEST_FILE,
    lockPath,
    manifestPath,
    packageDir,
    sourceDir,
    toPosixPath,
} from './paths.js'
import { ensureRootApmPackageDependency } from './root-manifest.js'
import {
    activePackageIds,
    packageIdsFromDisk,
    readLocalWorkspaceDocument,
    writeLocalWorkspaceDocument,
} from './workspace.js'
import { isRecord, parseYamlRecord, readText } from './yaml-io.js'

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
        instructions: manifestArrayLength(manifest.instructions),
        skills: agent?.skillRefs?.length || manifestArrayLength(manifest.skills),
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

async function agentFromMicrosoftApmSource(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
): Promise<WorkspaceAgentSnapshot | null> {
    const agentsDir = path.join(sourceDir(workingDir, packageId), 'agents')
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
        agentBody: parsed.body || null,
        skillRefs: [],
        mcpServerNames: extractMcpServerNames(manifest),
        runtimeAgentId: null,
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
    const readableManifestPath = manifestPath(workingDir, packageId)
    const readableLockPath = lockPath(workingDir, packageId)
    const stat = await fs.stat(readableManifestPath).catch(() => null)
    const extension = manifest['x-apm']
    return {
        packageId: extension?.packageId || packageId,
        name: manifest.name,
        version: manifest.version,
        description: typeof manifest.description === 'string' ? manifest.description : undefined,
        kind: extension?.kind || 'unknown',
        agentName: extension?.agent?.agentName,
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
    if (manifest.type === 'instructions') return 'instruction'
    if (manifest.type === 'prompts') return 'prompt'
    if (manifest.type === 'commands') return 'command'
    if (manifest.type === 'hooks') return 'hook'
    if (Array.isArray(manifest.dependencies?.mcp) && manifest.dependencies.mcp.length > 0) return 'mcp'
    if (Array.isArray(manifest.agents) && manifest.agents.length > 0) return 'agent'
    return 'package'
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

async function ensurePackageActiveInWorkspaceDocument(workingDir: string, packageId: string) {
    const document = await readLocalWorkspaceDocument(workingDir)
    if (document && !document.activePackageIds.includes(packageId)) {
        document.activePackageIds.push(packageId)
        await writeLocalWorkspaceDocument(workingDir, document)
    }
}

export async function copyApmPackage(
    sourceWorkingDir: string,
    targetWorkingDir: string,
    packageId: string,
): Promise<ApmPackageReadResponse> {
    const sourcePackage = await readApmPackage(sourceWorkingDir, packageId)
    if (!sourcePackage) {
        throw new Error('Source APM package not found.')
    }

    const sourcePath = packageDir(sourceWorkingDir, packageId)
    const targetPath = packageDir(targetWorkingDir, packageId)
    if (path.resolve(sourcePath) === path.resolve(targetPath)) {
        throw new Error('Source and target package locations are the same.')
    }

    await fs.rm(targetPath, { recursive: true, force: true })
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.cp(sourcePath, targetPath, { recursive: true })
    await ensureRootApmPackageDependency(targetWorkingDir, packageId)
    await ensurePackageActiveInWorkspaceDocument(targetWorkingDir, packageId)

    const readBack = await readApmPackage(targetWorkingDir, packageId)
    if (!readBack) {
        throw new Error('APM package copy did not produce a readable manifest.')
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

export async function listApmAgentProjectionSnapshots(
    workingDir: string,
): Promise<WorkspaceAgentSnapshot[]> {
    const ids = await activePackageIds(workingDir) ?? await packageIdsFromDisk(workingDir)
    const agents: WorkspaceAgentSnapshot[] = []
    for (const packageId of ids) {
        const manifest = await readManifestFile(manifestPath(workingDir, packageId)).catch(() => null)
        const agent = manifest?.['x-apm']?.agent
        if (agent) {
            const extensionAgent = agentFromExtension(agent, manifest)
            const sourceAgent = manifest
                ? await agentFromMicrosoftApmSource(workingDir, packageId, manifest)
                : null
            agents.push(sourceAgent
                ? {
                    ...extensionAgent,
                    agentBody: sourceAgent.agentBody || extensionAgent.agentBody,
                    meta: sourceAgent.meta || extensionAgent.meta,
                }
                : extensionAgent)
            continue
        }
        if (manifest) {
            const sourceAgent = await agentFromMicrosoftApmSource(workingDir, packageId, manifest)
            if (sourceAgent) {
                agents.push(sourceAgent)
            }
        }
    }
    if (agents.length > 0) {
        return agents
    }

    return []
}
