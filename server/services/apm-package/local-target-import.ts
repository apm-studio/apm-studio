import fs from 'fs/promises'
import path from 'path'
import {
    normalizeApmPackageScope,
    type ApmPackageManifest,
    type ApmTargetDefinitionImportRequest,
    type ApmTargetDefinitionImportResponse,
} from '../../../shared/apm-contracts.js'
import type {
    ApmSyncTargetDefinitionSummary,
} from '../../../shared/apm-sync-contracts.js'
import { getApmUserScopeCwd } from '../../lib/apm-studio-paths.js'
import {
    DEFAULT_STUDIO_MODEL,
} from './github-import-constants.js'
import type {
    AgentCandidate,
} from './github-import-detection.js'
import {
    firstParagraph,
    parseClaudeAgentMarkdown,
    parseCodexTomlAgent,
    parseFrontmatter,
} from './github-import-detection.js'
import type { ImportCandidate } from './github-import-candidate-types.js'
import {
    buildInstructionManifest,
    buildMcpManifest,
    buildSkillManifest,
} from './github-import-candidate-builders.js'
import {
    candidateId,
    modelSelection,
    packageIdForSource,
} from './github-import-candidate-ids.js'
import { slugify } from './github-import-utils.js'
import {
    buildTargetImportCandidates,
} from './target-import/adapters.js'
import { collectTargetDefinitions } from './target-definitions.js'
import {
    packageDir,
    manifestPath,
    toPosixPath,
} from './paths.js'
import { readApmPackage, writeApmPackage } from './repository.js'
import { readSyncOwnershipManifest } from './sync-ownership.js'
import { listSyncTargetProfiles } from './sync-targets.js'
import { yamlString } from './yaml-io.js'

const LOCAL_TARGET_IMPORT_REF = 'workspace'

function localRepo(definition: ApmSyncTargetDefinitionSummary) {
    return `local-target/${definition.target}`
}

function localSource(definition: ApmSyncTargetDefinitionSummary) {
    return {
        type: 'target',
        target: definition.target,
        path: definition.path,
    }
}

function normalizeRelativePath(value: string) {
    return toPosixPath(value).replace(/^\/+/, '')
}

function safeWorkspacePath(workingDir: string, relativePath: string) {
    const normalized = normalizeRelativePath(relativePath)
    const resolved = path.resolve(workingDir, normalized)
    const relative = path.relative(workingDir, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Target path is outside the workspace: ${relativePath}`)
    }
    return resolved
}

function safePackagePath(packageRoot: string, relativePath: string) {
    const normalized = normalizeRelativePath(relativePath)
    const resolved = path.resolve(packageRoot, normalized)
    const relative = path.relative(packageRoot, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Package copy path is outside the package: ${relativePath}`)
    }
    return resolved
}

function hasMarkdownFrontmatter(content: string) {
    return content.trimStart().startsWith('---\n')
}

function frontmatter(fields: Record<string, unknown>) {
    const yaml = yamlString(Object.fromEntries(
        Object.entries(fields).filter(([, value]) => {
            if (value === null || value === undefined) return false
            if (Array.isArray(value) && value.length === 0) return false
            return true
        }),
    )).trimEnd()
    return `---\n${yaml}\n---`
}

function markdownWithFrontmatter(name: string, description: string, raw: string) {
    if (hasMarkdownFrontmatter(raw)) {
        return raw.trimEnd() + '\n'
    }
    return `${frontmatter({ name, description })}\n\n${raw.trimEnd()}\n`
}

function copyRootsForDefinition(definition: ApmSyncTargetDefinitionSummary) {
    const roots = new Set<string>([definition.path])
    const sourcePath = definition.path
    if (definition.kind === 'skill' && path.posix.basename(sourcePath).toLowerCase() === 'skill.md') {
        roots.add(path.posix.dirname(sourcePath))
    }
    if (sourcePath === '.codex/hooks.json') roots.add('.codex/hooks')
    if (sourcePath === '.cursor/hooks.json') roots.add('.cursor/hooks')
    if (sourcePath === '.windsurf/hooks.json') roots.add('.windsurf/hooks')
    if (sourcePath === '.gemini/settings.json') roots.add('.gemini/hooks')
    if (sourcePath === '.claude/settings.json' || sourcePath === '.claude/settings.local.json') {
        roots.add('.claude/hooks')
    }
    if (sourcePath.startsWith('.github/hooks/')) roots.add('.github/hooks')
    return Array.from(roots)
}

async function walkLocalTree(workingDir: string, roots: string[]) {
    const result = new Set<string>()
    async function walk(relativePath: string) {
        const filePath = safeWorkspacePath(workingDir, relativePath)
        const stat = await fs.stat(filePath).catch(() => null)
        if (!stat) return
        if (stat.isFile()) {
            result.add(normalizeRelativePath(relativePath))
            return
        }
        if (!stat.isDirectory()) return
        const entries = await fs.readdir(filePath, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
            if (entry.name === '.git' || entry.name === 'node_modules') continue
            await walk(toPosixPath(path.join(relativePath, entry.name)))
        }
    }

    for (const root of roots) {
        await walk(root)
    }
    return Array.from(result).sort((left, right) => left.localeCompare(right))
}

function withLocalTargetSource(
    candidate: ImportCandidate,
    definition: ApmSyncTargetDefinitionSummary,
): ImportCandidate {
    const extension = candidate.manifest['x-apm']
    return {
        ...candidate,
        manifest: {
            ...candidate.manifest,
            target: [definition.target],
            marketplace: {
                ...(candidate.manifest.marketplace && typeof candidate.manifest.marketplace === 'object'
                    ? candidate.manifest.marketplace
                    : {}),
                source: localSource(definition),
            },
            'x-apm': extension
                ? {
                    ...extension,
                    ...(extension.agent
                        ? {
                            agent: {
                                ...extension.agent,
                                derivedFrom: `target:${definition.target}:${definition.path}`,
                            },
                        }
                        : {}),
                }
                : undefined,
        },
    }
}

function buildLocalAgentCandidate(
    definition: ApmSyncTargetDefinitionSummary,
    raw: string,
): ImportCandidate {
    const parsed = parseCodexTomlAgent(definition.path, raw)
        || parseClaudeAgentMarkdown(definition.path, raw)
    const markdown = parseFrontmatter(raw)
    const name = slugify(parsed?.name || definition.name, 'agent')
    const description = parsed?.description
        || (typeof markdown?.data.description === 'string' ? markdown.data.description : null)
        || firstParagraph(raw, `${name} agent`)
    const instruction = parsed?.instruction
        || markdown?.content
        || raw.trim()
        || `You are ${name}.`
    const packageId = packageIdForSource(
        localRepo(definition),
        LOCAL_TARGET_IMPORT_REF,
        definition.path,
        name,
        'target-agent',
    )
    const model = parsed ? modelSelection(parsed as AgentCandidate) : DEFAULT_STUDIO_MODEL
    const manifest: ApmPackageManifest = {
        name,
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        target: [definition.target],
        description,
        marketplace: { source: localSource(definition) },
        agents: [{
            id: packageId,
            name,
            model,
            instruction: {
                source: 'inline',
                content: instruction,
            },
            source: {
                type: 'target',
                target: definition.target,
                path: definition.path,
                ...(parsed?.adapter ? { adapter: parsed.adapter } : {}),
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
                agentName: name,
                model,
                modelVariant: parsed?.modelVariant || null,
                agentBody: instruction,
                skillRefs: [],
                mcpServerNames: [],
                runtimeAgentId: null,
                planMode: false,
                derivedFrom: `target:${definition.target}:${definition.path}`,
            },
        },
    }
    return {
        id: candidateId(localRepo(definition), LOCAL_TARGET_IMPORT_REF, definition.path, 'target-agent'),
        name,
        description,
        kind: 'agent',
        format: 'target-native',
        sourcePath: definition.path,
        packageId,
        targets: [definition.target],
        primitiveCounts: { agents: 1 },
        manifest,
        copyFiles: [],
    }
}

function buildPromptLikeCandidate(
    definition: ApmSyncTargetDefinitionSummary,
    raw: string,
): ImportCandidate {
    const name = slugify(definition.name, definition.kind === 'prompt' ? 'prompt' : 'command')
    const description = firstParagraph(raw, `${name} ${definition.kind}`)
    const packageId = packageIdForSource(
        localRepo(definition),
        LOCAL_TARGET_IMPORT_REF,
        definition.path,
        name,
        `target-${definition.kind}`,
    )
    const targetPath = `.apm/prompts/${name}.prompt.md`
    const manifestKind = definition.kind === 'prompt' ? 'prompt' : 'command'
    return {
        id: candidateId(localRepo(definition), LOCAL_TARGET_IMPORT_REF, definition.path, `target-${definition.kind}`),
        name,
        description,
        kind: 'package',
        format: 'target-native',
        sourcePath: definition.path,
        packageId,
        targets: [definition.target],
        primitiveCounts: { prompts: 1, commands: 1 },
        manifest: {
            name,
            version: '0.1.0',
            type: 'prompts',
            includes: 'auto',
            target: [definition.target],
            description,
            marketplace: { source: localSource(definition) },
            prompts: [{ path: targetPath }],
            dependencies: { apm: [], mcp: [] },
            'x-apm': {
                schemaVersion: 1,
                packageId,
                kind: manifestKind,
            },
        },
        copyFiles: [{
            targetPath,
            content: markdownWithFrontmatter(name, description, raw),
        }],
    }
}

function buildHookJsonCandidate(
    definition: ApmSyncTargetDefinitionSummary,
): ImportCandidate | null {
    if (!definition.path.toLowerCase().endsWith('.json')) return null
    const name = slugify(`${definition.name} ${definition.target} hooks`, 'hooks')
    const packageId = packageIdForSource(
        localRepo(definition),
        LOCAL_TARGET_IMPORT_REF,
        definition.path,
        name,
        'target-hook',
    )
    const targetPath = `.apm/hooks/${name}.json`
    return {
        id: candidateId(localRepo(definition), LOCAL_TARGET_IMPORT_REF, definition.path, 'target-hook'),
        name,
        description: `${definition.target} hook config from ${definition.path}.`,
        kind: 'package',
        format: 'target-native',
        sourcePath: definition.path,
        packageId,
        targets: [definition.target],
        primitiveCounts: { hooks: 1 },
        manifest: {
            name,
            version: '0.1.0',
            type: 'hybrid',
            includes: 'auto',
            target: [definition.target],
            description: `${definition.target} hook config from ${definition.path}.`,
            marketplace: { source: localSource(definition) },
            dependencies: { apm: [], mcp: [] },
            'x-apm': {
                schemaVersion: 1,
                packageId,
                kind: 'hook',
            },
        },
        copyFiles: [{
            sourcePath: definition.path,
            targetPath,
        }],
    }
}

function buildLocalCandidate(input: {
    definition: ApmSyncTargetDefinitionSummary
    raw: string
    tree: string[]
}): ImportCandidate | null {
    const { definition, raw, tree } = input
    const targetCandidates = buildTargetImportCandidates({
        repo: localRepo(definition),
        ref: LOCAL_TARGET_IMPORT_REF,
        sourcePath: definition.path,
        raw,
        tree,
    }, 'target-native')
    if (targetCandidates[0]) {
        return withLocalTargetSource(targetCandidates[0], definition)
    }
    if (definition.kind === 'skill') {
        return withLocalTargetSource(
            buildSkillManifest(localRepo(definition), LOCAL_TARGET_IMPORT_REF, definition.path, raw, tree),
            definition,
        )
    }
    if (definition.kind === 'agent') {
        return buildLocalAgentCandidate(definition, raw)
    }
    if (definition.kind === 'mcp') {
        const candidate = buildMcpManifest(localRepo(definition), LOCAL_TARGET_IMPORT_REF, definition.path, raw)
        return candidate ? withLocalTargetSource(candidate, definition) : null
    }
    if (definition.kind === 'instruction') {
        return withLocalTargetSource(
            buildInstructionManifest(localRepo(definition), LOCAL_TARGET_IMPORT_REF, definition.path, raw),
            definition,
        )
    }
    if (definition.kind === 'prompt' || definition.kind === 'command') {
        return buildPromptLikeCandidate(definition, raw)
    }
    if (definition.kind === 'hook') {
        return buildHookJsonCandidate(definition)
    }
    return null
}

async function copyLocalCandidateFiles(
    sourceWorkingDir: string,
    targetWorkingDir: string,
    candidate: ImportCandidate,
) {
    if (candidate.copyFiles.length === 0) return
    const root = packageDir(targetWorkingDir, candidate.packageId)
    for (const file of candidate.copyFiles) {
        const target = safePackagePath(root, file.targetPath)
        await fs.mkdir(path.dirname(target), { recursive: true })
        if (file.content !== undefined) {
            await fs.writeFile(target, file.content, 'utf-8')
            continue
        }
        if (!file.sourcePath) continue
        await fs.copyFile(safeWorkspacePath(sourceWorkingDir, file.sourcePath), target)
    }
}

function findRequestedDefinition(
    definitions: ApmSyncTargetDefinitionSummary[],
    requestedPath: string,
) {
    const normalizedPath = normalizeRelativePath(requestedPath)
    return definitions.find((definition) => (
        definition.path === normalizedPath || definition.id === requestedPath
    ))
}

function targetExists(target: string) {
    return listSyncTargetProfiles().some((profile) => profile.id === target)
}

export async function importApmPackageFromTargetDefinition(
    workingDir: string,
    request: ApmTargetDefinitionImportRequest,
): Promise<ApmTargetDefinitionImportResponse> {
    if (!targetExists(request.target)) {
        throw new Error('Unsupported target.')
    }
    if (!request.path?.trim()) {
        throw new Error('path is required.')
    }

    const ownership = await readSyncOwnershipManifest(workingDir)
    const definitions = await collectTargetDefinitions(workingDir, request.target, ownership)
    const definition = findRequestedDefinition(definitions, request.path)
    if (!definition) {
        throw new Error(`Target definition not found: ${request.path}`)
    }
    if (definition.managed) {
        throw new Error('Managed target definitions are already owned by an APM package.')
    }

    const sourceFile = safeWorkspacePath(workingDir, definition.path)
    const raw = await fs.readFile(sourceFile, 'utf-8')
    const tree = await walkLocalTree(workingDir, copyRootsForDefinition(definition))
    const candidate = buildLocalCandidate({ definition, raw, tree })
    if (!candidate) {
        throw new Error(`Target definition cannot be imported as an APM package yet: ${definition.path}`)
    }

    const scope = normalizeApmPackageScope(request.scope)
    const targetWorkingDir = scope === 'user' ? getApmUserScopeCwd() : workingDir
    const existing = await readApmPackage(targetWorkingDir, candidate.packageId).catch(() => null)
    const written = await writeApmPackage(targetWorkingDir, candidate.packageId, candidate.manifest)
    await copyLocalCandidateFiles(workingDir, targetWorkingDir, candidate)

    return {
        ok: true,
        scope,
        targetWorkingDir,
        target: definition.target,
        definitionPath: definition.path,
        packages: [{
            packageId: written.packageId,
            name: candidate.name,
            kind: candidate.kind,
            sourcePath: candidate.sourcePath,
            packagePath: toPosixPath(path.relative(targetWorkingDir, packageDir(targetWorkingDir, written.packageId))),
            manifestPath: toPosixPath(path.relative(targetWorkingDir, manifestPath(targetWorkingDir, written.packageId))),
        }],
        warnings: existing ? [`Updated existing package ${candidate.packageId}.`] : [],
    }
}
