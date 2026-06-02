import path from 'path'
import type { ApmDependency, ApmPackageManifest } from '../../../shared/apm-contracts.js'
import { MANIFEST_FILE } from './paths.js'
import { parseYamlRecord } from './yaml-io.js'
import {
    firstParagraph,
    parseFrontmatter,
    type AgentCandidate,
} from './github-import-detection.js'
import {
    ALL_TARGET_IDS,
    ALL_TARGET_LABELS,
} from './github-import-constants.js'
import { slugify } from './github-import-utils.js'
import type { ImportCandidate } from './github-import-candidate-types.js'
import {
    candidateId,
    githubSource,
    modelSelection,
    packageIdForAgentCandidate,
    packageIdForSource,
    sourceRootForManifest,
} from './github-import-candidate-ids.js'

function buildAgentManifest(repo: string, ref: string, candidate: AgentCandidate): ApmPackageManifest {
    const packageId = packageIdForAgentCandidate(repo, ref, candidate)
    const model = modelSelection(candidate)
    return {
        name: slugify(candidate.name),
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        target: ALL_TARGET_IDS,
        description: candidate.description,
        marketplace: { source: githubSource(repo, ref, candidate.sourcePath, candidate.adapter) },
        agents: [{
            id: packageId,
            name: candidate.name,
            model,
            instruction: {
                source: 'inline',
                content: candidate.instruction,
            },
            source: {
                type: 'github',
                repo,
                ref,
                path: candidate.sourcePath,
                adapter: candidate.adapter,
                ...(candidate.model ? { sourceModel: candidate.model } : {}),
                ...(candidate.tools?.length ? { tools: candidate.tools } : {}),
            },
        }],
        instructions: [],
        skills: [],
        dependencies: {
            apm: [],
            mcp: [],
        },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'agent',
            agent: {
                agentNodeId: packageId,
                agentName: candidate.name,
                model,
                modelVariant: candidate.modelVariant || null,
                agentBody: candidate.instruction,
                skillRefs: [],
                mcpServerNames: [],
                runtimeAgentId: null,
                planMode: false,
                derivedFrom: `github:${repo}:${ref}:${candidate.sourcePath}`,
            },
        },
    }
}

export function buildInstructionManifest(repo: string, ref: string, sourcePath: string, raw: string): ImportCandidate {
    const parsed = parseFrontmatter(raw)
    const name = slugify(
        (parsed?.data.name as string | undefined)
            || path.posix.basename(sourcePath, path.posix.extname(sourcePath)),
        'instruction',
    )
    const description = (parsed?.data.description as string | undefined)
        || firstParagraph(raw, `${name} instructions`)
    const packageId = packageIdForSource(repo, ref, sourcePath, name, 'instruction-md')
    const targetPath = `.apm/instructions/${name}.instructions.md`
    const manifest: ApmPackageManifest = {
        name,
        version: '0.1.0',
        type: 'instructions',
        includes: 'auto',
        target: ALL_TARGET_IDS,
        description,
        marketplace: { source: githubSource(repo, ref, sourcePath, 'instruction-md') },
        instructions: [{ path: targetPath }],
        dependencies: { apm: [], mcp: [] },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'instruction',
        },
    }
    return {
        id: candidateId(repo, ref, sourcePath, 'instruction-md'),
        name,
        description,
        kind: 'instruction',
        format: 'instruction-md',
        sourcePath,
        packageId,
        targets: ALL_TARGET_LABELS,
        primitiveCounts: { instructions: 1 },
        manifest,
        copyFiles: [{ sourcePath, targetPath }],
    }
}

export function buildSkillManifest(repo: string, ref: string, sourcePath: string, raw: string, tree: string[]): ImportCandidate {
    const parsed = parseFrontmatter(raw)
    const name = slugify(
        (parsed?.data.name as string | undefined)
            || path.posix.basename(path.posix.dirname(sourcePath))
            || path.posix.basename(sourcePath, '.md'),
        'skill',
    )
    const description = (parsed?.data.description as string | undefined)
        || firstParagraph(raw, `${name} skill`)
    const packageId = packageIdForSource(repo, ref, sourcePath, name, 'skill-md')
    const skillRoot = path.posix.dirname(sourcePath)
    const copySourceRoot = skillRoot === '.' ? '' : `${skillRoot}/`
    const targetRoot = `.apm/skills/${name}`
    const copyFiles = tree
        .filter((entry) => entry === sourcePath || (copySourceRoot && entry.startsWith(copySourceRoot)))
        .map((entry) => ({
            sourcePath: entry,
            targetPath: `${targetRoot}/${copySourceRoot ? entry.slice(copySourceRoot.length) : path.posix.basename(entry)}`,
        }))
    const manifest: ApmPackageManifest = {
        name,
        version: '0.1.0',
        type: 'skill',
        includes: 'auto',
        target: ALL_TARGET_IDS,
        description,
        marketplace: { source: githubSource(repo, ref, sourcePath, 'skill-md') },
        skills: [{ path: `${targetRoot}/SKILL.md` }],
        dependencies: { apm: [], mcp: [] },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'skill',
        },
    }
    return {
        id: candidateId(repo, ref, sourcePath, 'skill-md'),
        name,
        description,
        kind: 'skill',
        format: 'skill-md',
        sourcePath,
        packageId,
        targets: ALL_TARGET_LABELS,
        primitiveCounts: { skills: 1 },
        manifest,
        copyFiles,
    }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringRecord(value: unknown) {
    if (!isPlainRecord(value)) return undefined
    const entries = Object.entries(value)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function mcpDependencyFromConfig(name: string, value: unknown): ApmDependency {
    if (!isPlainRecord(value)) return { name }

    const commandParts = Array.isArray(value.command)
        ? value.command.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
    const command = typeof value.command === 'string' && value.command.trim()
        ? value.command.trim()
        : (commandParts[0] || null)
    const url = typeof value.url === 'string' && value.url.trim()
        ? value.url.trim()
        : null
    const rawTransport = typeof value.transport === 'string'
        ? value.transport
        : (typeof value.type === 'string' ? value.type : null)
    const transport = rawTransport?.trim()
    if (!command && !url) {
        return transport ? { name, transport } : { name }
    }

    const dependency: Record<string, unknown> = {
        name,
        registry: false,
        transport: transport || (url ? 'http' : 'stdio'),
    }
    if (command) dependency.command = command
    if (url) dependency.url = url
    if (Array.isArray(value.args) || isPlainRecord(value.args)) {
        dependency.args = value.args
    } else if (commandParts.length > 1) {
        dependency.args = commandParts.slice(1)
    }
    const env = stringRecord(value.env)
    if (env) dependency.env = env
    const headers = stringRecord(value.headers)
    if (headers) dependency.headers = headers
    return dependency
}

function mcpServersFromConfig(parsed: unknown) {
    if (!isPlainRecord(parsed)) return null
    if (isPlainRecord(parsed.mcpServers)) return parsed.mcpServers
    if (isPlainRecord(parsed.servers)) return parsed.servers
    if (isPlainRecord(parsed.mcp)) {
        return isPlainRecord(parsed.mcp.servers) ? parsed.mcp.servers : parsed.mcp
    }
    return parsed
}

export function buildMcpManifest(repo: string, ref: string, sourcePath: string, raw: string): ImportCandidate | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return null
    }
    const serversRecord = mcpServersFromConfig(parsed)
    const names = serversRecord && typeof serversRecord === 'object' && !Array.isArray(serversRecord)
        ? Object.keys(serversRecord as Record<string, unknown>)
        : []
    if (names.length === 0) return null
    const mcpDependencies = names.map((serverName) =>
        mcpDependencyFromConfig(serverName, (serversRecord as Record<string, unknown>)[serverName]),
    )

    const name = slugify(path.posix.basename(sourcePath, path.posix.extname(sourcePath)), 'mcp')
    const packageId = packageIdForSource(repo, ref, sourcePath, name, 'mcp-config')
    const targetPath = `.apm/mcp/${path.posix.basename(sourcePath)}`
    const manifest: ApmPackageManifest = {
        name,
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        target: ALL_TARGET_IDS,
        description: `MCP config with ${names.length} server${names.length === 1 ? '' : 's'}.`,
        marketplace: { source: githubSource(repo, ref, sourcePath, 'mcp-config') },
        dependencies: {
            apm: [],
            mcp: mcpDependencies,
        },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'mcp',
        },
    }
    return {
        id: candidateId(repo, ref, sourcePath, 'mcp-config'),
        name,
        description: manifest.description || name,
        kind: 'mcp',
        format: 'mcp-config',
        sourcePath,
        packageId,
        targets: ALL_TARGET_LABELS,
        primitiveCounts: { mcp: mcpDependencies.length },
        manifest,
        copyFiles: [{ sourcePath, targetPath }],
    }
}

function mcpDependencyCount(manifest: ApmPackageManifest) {
    return Array.isArray(manifest.dependencies?.mcp)
        ? manifest.dependencies.mcp.length
        : 0
}

export function buildApmManifestCandidate(repo: string, ref: string, sourcePath: string, raw: string, tree: string[]): ImportCandidate | null {
    let manifest: ApmPackageManifest
    try {
        manifest = parseYamlRecord<ApmPackageManifest>(raw, MANIFEST_FILE)
    } catch {
        return null
    }
    if (typeof manifest.name !== 'string' || !manifest.name.trim()) return null
    const root = sourceRootForManifest(sourcePath)
    const apmPrefix = root ? `${root}/.apm/` : '.apm/'
    const extensionPackageId = typeof manifest['x-apm']?.packageId === 'string'
        ? manifest['x-apm']?.packageId
        : null
    const packageId = extensionPackageId || packageIdForSource(repo, ref, sourcePath, manifest.name, 'apm')
    const copyFiles = tree
        .filter((entry) => entry.startsWith(apmPrefix))
        .map((entry) => ({
            sourcePath: entry,
            targetPath: `.apm/${entry.slice(apmPrefix.length)}`,
        }))
    const promptCount = copyFiles.filter((entry) =>
        entry.targetPath.startsWith('.apm/prompts/') && entry.targetPath.endsWith('.prompt.md'),
    ).length
    const primitiveCounts = {
        agents: copyFiles.filter((entry) => entry.targetPath.startsWith('.apm/agents/')).length,
        instructions: copyFiles.filter((entry) => entry.targetPath.startsWith('.apm/instructions/')).length,
        skills: copyFiles.filter((entry) => entry.targetPath.endsWith('/SKILL.md')).length,
        prompts: promptCount,
        commands: promptCount,
        hooks: copyFiles.filter((entry) => entry.targetPath.startsWith('.apm/hooks/') && entry.targetPath.endsWith('.json')).length,
        ...(mcpDependencyCount(manifest) > 0 ? { mcp: mcpDependencyCount(manifest) } : {}),
    }
    return {
        id: candidateId(repo, ref, sourcePath, 'apm'),
        name: manifest.name,
        description: typeof manifest.description === 'string' ? manifest.description : `${manifest.name} APM package`,
        kind: 'package',
        format: 'apm',
        sourcePath,
        packageId,
        targets: Array.isArray(manifest.target)
            ? manifest.target.map((entry) => String(entry))
            : (typeof manifest.target === 'string' ? [manifest.target] : ALL_TARGET_LABELS),
        primitiveCounts,
        manifest: {
            ...manifest,
            marketplace: {
                ...(manifest.marketplace && typeof manifest.marketplace === 'object' ? manifest.marketplace : {}),
                source: githubSource(repo, ref, sourcePath, 'apm'),
            },
            'x-apm': {
                schemaVersion: 1,
                kind: manifest['x-apm']?.kind || 'package',
                ...manifest['x-apm'],
                packageId,
            },
        },
        copyFiles,
    }
}

export function agentCandidateToImportCandidate(repo: string, ref: string, candidate: AgentCandidate): ImportCandidate {
    const manifest = buildAgentManifest(repo, ref, candidate)
    const packageId = manifest['x-apm']?.packageId || packageIdForAgentCandidate(repo, ref, candidate)
    return {
        id: candidateId(repo, ref, candidate.sourcePath, candidate.adapter),
        name: candidate.name,
        description: candidate.description,
        kind: 'agent',
        format: candidate.adapter,
        sourcePath: candidate.sourcePath,
        packageId,
        targets: ALL_TARGET_LABELS,
        primitiveCounts: { agents: 1, instructions: 1 },
        manifest,
        copyFiles: [],
    }
}
