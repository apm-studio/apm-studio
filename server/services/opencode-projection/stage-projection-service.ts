import fs from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { readGlobalMcpCatalog } from '../../lib/mcp-catalog.js'
import { resolveRuntimeTools, type RuntimeToolResolution } from '../../lib/runtime-tools.js'
import { mcpToolPattern } from '../../../shared/mcp-catalog.js'
import type { McpCatalog } from '../../../shared/mcp-catalog.js'
import {
    cleanGroupFiles,
    markProjectionRuntimePending,
    readManifest,
    toRelativePath,
    updateGitExclude,
    updateManifestGroup,
    resolveAgentIdentity,
    writeManifest,
    type ProjectionManifest,
} from './projection-manifest.js'
import { compileDance, type CompiledSkill } from './dance-compiler.js'
import {
    compilePerformer,
    resolveCodexProjectAgentModelId,
    type CompiledPerformer,
    type PerformerCompileInput,
    type Posture,
} from './performer-compiler.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import { COLLABORATION_TOOL_NAMES, STALE_COLLABORATION_TOOL_NAMES } from '../act-runtime/act-tools.js'

// ── @mention relation support (inlined from deleted relation-compiler.ts) ──

interface RequestRelationTarget {
    performerId: string
    performerName: string
    agentName: string
    description?: string
}

interface CompiledRequestRelations {
    taskAllowlist: string[]
    promptSection: string | null
}

function compileMentionRelations(targets: RequestRelationTarget[]): CompiledRequestRelations {
    if (targets.length === 0) {
        return { taskAllowlist: [], promptSection: null }
    }
    const lines = [
        '# Available Agents',
        '',
        'The following agents are available for @mention in this context.',
        'Use the `task` tool only when it is actually useful, and only with the allowed agent names below.',
        '',
    ]
    for (const target of targets) {
        lines.push(`- **${target.performerName}**: use \`task\` with agent="${target.agentName}"${target.description ? ` — ${target.description}` : ''}`)
    }
    return {
        taskAllowlist: targets.map((target) => target.agentName),
        promptSection: lines.join('\n'),
    }
}

type AssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }



type CapabilitySnapshot = {
    toolCall: boolean
    reasoning: boolean
    attachment: boolean
    temperature: boolean
    modalities: {
        input: string[]
        output: string[]
    }
} | null

export interface PerformerProjectionInput {
    performerId: string
    performerName: string
    talRef: AssetRef | null
    danceRefs: AssetRef[]
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    workingDir: string
    requestTargets?: Array<{
        performerId: string
        performerName: string
        description?: string
    }>
    scope?: 'workspace' | 'act'
    actId?: string
    extraTools?: Array<{
        name: string
        content: string
    }>
}

export interface EnsuredPerformerProjection {
    compiled: CompiledPerformer
    toolResolution: RuntimeToolResolution
    toolMap: Record<string, boolean>
    capabilitySnapshot: CapabilitySnapshot
    changed: boolean
    codexChanged: boolean
}

export interface EnsuredCodexPerformerProjection {
    performerId: string
    codexAgentName?: string
    codexAgentPath?: string
    codexAgentRelativePath?: string
    changed: boolean
    codexChanged: boolean
    skillChanged: boolean
    skipped: boolean
}

export type CodexProjectionPerformerSnapshot = {
    id?: string
    name?: string
    model?: ModelSelection | null
    modelVariant?: string | null
    talRef?: AssetRef | null
    danceRefs?: AssetRef[]
    mcpServerNames?: string[]
}

function computeWorkspaceHash(workingDir: string) {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 12)
}

function groupKey(performerId: string) {
    return `performer:${performerId}`
}

export async function pruneStalePerformerProjections(workingDir: string, performerIds: string[]) {
    const manifest = await readManifest(workingDir)
    if (!manifest) {
        return false
    }

    const activeIds = new Set(performerIds)
    const staleKeys = Object.keys(manifest.groups).filter((key) => {
        if (!key.startsWith('performer:')) return false
        const performerId = key.slice('performer:'.length)
        return !activeIds.has(performerId)
    })

    if (staleKeys.length === 0) {
        return false
    }

    for (const key of staleKeys) {
        for (const file of manifest.groups[key] || []) {
            await fs.rm(path.join(workingDir, file), { force: true, recursive: true }).catch(() => {})
        }
        delete manifest.groups[key]
    }

    await writeManifest(workingDir, manifest)
    return true
}

async function writeIfChanged(filePath: string, content: string) {
    const current = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (current === content) {
        return false
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return true
}

function isCodexAgentProjectionPath(filePath: string) {
    return filePath.startsWith('.codex/agents/dot_studio_') && filePath.endsWith('.toml')
}

function isCodexSkillLinkProjectionPath(filePath: string) {
    return filePath.startsWith('.agents/skills/dot-studio-')
}

function isCodexImmediateProjectionPath(filePath: string) {
    return isCodexAgentProjectionPath(filePath) || isCodexSkillLinkProjectionPath(filePath)
}

function sanitizeCodexSkillSegment(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
}

function attachCodexSkillPaths(
    workingDir: string,
    performerId: string,
    skills: CompiledSkill[],
): CompiledSkill[] {
    return skills.map((skill) => {
        const hash = createHash('sha1')
            .update(`${performerId}:${skill.relativePath}`)
            .digest('hex')
            .slice(0, 8)
        const performerSegment = sanitizeCodexSkillSegment(performerId) || 'performer'
        const skillSegment = sanitizeCodexSkillSegment(skill.logicalName) || 'skill'
        const linkDir = path.join(
            workingDir,
            '.agents',
            'skills',
            `dot-studio-${performerSegment}-${skillSegment}-${hash}`,
        )
        const codexFilePath = path.join(linkDir, 'SKILL.md')

        return {
            ...skill,
            codexFilePath,
            codexRelativePath: toRelativePath(workingDir, codexFilePath),
            codexLinkPath: linkDir,
            codexLinkRelativePath: toRelativePath(workingDir, linkDir),
        }
    })
}

async function syncCodexSkillLinks(skills: CompiledSkill[]) {
    let changed = false

    for (const skill of skills) {
        if (!skill.codexLinkPath) {
            continue
        }

        const targetDir = path.dirname(skill.filePath)
        const current = await fs.lstat(skill.codexLinkPath).catch(() => null)
        const expectedTarget = process.platform === 'win32'
            ? targetDir
            : path.relative(path.dirname(skill.codexLinkPath), targetDir)

        if (current?.isSymbolicLink()) {
            const currentTarget = await fs.readlink(skill.codexLinkPath).catch(() => null)
            if (currentTarget === expectedTarget) {
                continue
            }
        }

        await fs.rm(skill.codexLinkPath, { force: true, recursive: true }).catch(() => {})
        await fs.mkdir(path.dirname(skill.codexLinkPath), { recursive: true })
        await fs.symlink(
            expectedTarget,
            skill.codexLinkPath,
            process.platform === 'win32' ? 'junction' : 'dir',
        )
        changed = true
    }

    return changed
}

function createManifest(workspaceHash: string): ProjectionManifest {
    return {
        version: 1,
        owner: 'dot-studio',
        workspaceHash,
        groups: {},
    }
}

async function updateCodexProjectionManifestGroup(input: {
    workingDir: string
    workspaceHash: string
    performerId: string
    currentFiles: string[]
}) {
    const manifest = (await readManifest(input.workingDir)) || createManifest(input.workspaceHash)
    const key = groupKey(input.performerId)
    const previousFiles = manifest.groups[key] || []
    const currentCodexFiles = new Set(input.currentFiles.filter(isCodexImmediateProjectionPath))

    let changed = false
    for (const file of previousFiles) {
        if (isCodexImmediateProjectionPath(file) && !currentCodexFiles.has(file)) {
            await fs.rm(path.join(input.workingDir, file), { force: true, recursive: true }).catch(() => {})
            changed = true
        }
    }

    const nextFiles = Array.from(new Set([
        ...previousFiles.filter((file) => !isCodexImmediateProjectionPath(file)),
        ...input.currentFiles,
    ]))

    if (nextFiles.length > 0) {
        manifest.workspaceHash = input.workspaceHash
        manifest.groups[key] = nextFiles
    } else {
        delete manifest.groups[key]
    }

    await writeManifest(input.workingDir, manifest)
    return changed
}

function buildProjectedToolMap(mcpServerNames: string[]) {
    return Object.fromEntries(
        Array.from(new Set(mcpServerNames.filter(Boolean)))
            .sort((left, right) => left.localeCompare(right))
            .map((serverName) => [mcpToolPattern(serverName), true]),
    )
}

async function resolveCodexMcpServers(mcpServerNames: string[]): Promise<McpCatalog | undefined> {
    const resolvedNames = Array.from(new Set(mcpServerNames.filter(Boolean))).sort((left, right) => left.localeCompare(right))
    if (resolvedNames.length === 0) {
        return undefined
    }

    const catalog = await readGlobalMcpCatalog()
    const entries = resolvedNames.flatMap((serverName) => {
        const config = catalog[serverName]
        return config ? [[serverName, config] as const] : []
    })

    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

async function resolveCapabilitySnapshot(cwd: string, model: ModelSelection): Promise<CapabilitySnapshot> {
    if (!model) {
        return null
    }
    const runtimeModel = await resolveRuntimeModel(cwd, model)
    if (!runtimeModel) {
        return null
    }
    return {
        toolCall: runtimeModel.toolCall,
        reasoning: runtimeModel.reasoning,
        attachment: runtimeModel.attachment,
        temperature: runtimeModel.temperature,
        modalities: runtimeModel.modalities,
    }
}

export async function ensureCodexPerformerProjection(
    input: PerformerProjectionInput,
): Promise<EnsuredCodexPerformerProjection> {
    const workspaceHash = computeWorkspaceHash(input.workingDir)
    const codexModelId = resolveCodexProjectAgentModelId(input.model)

    if (!codexModelId) {
        const pruned = await updateCodexProjectionManifestGroup({
            workingDir: input.workingDir,
            workspaceHash,
            performerId: input.performerId,
            currentFiles: [],
        })
        await updateGitExclude(input.workingDir)
        return {
            performerId: input.performerId,
            changed: pruned,
            codexChanged: pruned,
            skillChanged: false,
            skipped: true,
        }
    }

    const codexMcpServers = await resolveCodexMcpServers(input.mcpServerNames)

    const compiledSkills: CompiledSkill[] = []
    for (const ref of input.danceRefs) {
        compiledSkills.push(await compileDance(
            input.workingDir,
            ref,
            workspaceHash,
            input.performerId,
            input.workingDir,
            'workspace',
        ))
    }
    const skills = attachCodexSkillPaths(input.workingDir, input.performerId, compiledSkills)

    const compiled = await compilePerformer(
        input.workingDir,
        {
            performerId: input.performerId,
            performerName: input.performerName,
            talRef: input.talRef,
            model: input.model,
            modelVariant: input.modelVariant || null,
            workspaceHash,
            executionDir: input.workingDir,
            scope: 'stage',
            skillNames: skills.map((skill) => skill.logicalName),
            toolMap: {},
            codexMcpServers,
            relationPromptSection: null,
        } satisfies PerformerCompileInput,
        skills,
    )

    let skillChanged = false
    for (const skill of skills) {
        skillChanged = (await writeIfChanged(skill.filePath, skill.content)) || skillChanged
        skillChanged = skill.bundleChanged || skillChanged
    }
    const skillLinkChanged = await syncCodexSkillLinks(skills)

    const currentFiles = [
        ...(compiled.codexAgentRelativePath ? [compiled.codexAgentRelativePath] : []),
        ...skills.flatMap((skill) => [
            skill.relativePath,
            ...(skill.codexLinkRelativePath ? [skill.codexLinkRelativePath] : []),
            ...skill.additionalFiles,
        ]),
    ]

    const codexChanged = compiled.codexAgentPath && compiled.codexAgentContent
        ? await writeIfChanged(compiled.codexAgentPath, compiled.codexAgentContent)
        : false
    const prunedCodex = await updateCodexProjectionManifestGroup({
        workingDir: input.workingDir,
        workspaceHash,
        performerId: input.performerId,
        currentFiles,
    })

    await updateGitExclude(input.workingDir)

    return {
        performerId: input.performerId,
        codexAgentName: compiled.codexAgentName,
        codexAgentPath: compiled.codexAgentPath,
        codexAgentRelativePath: compiled.codexAgentRelativePath,
        changed: skillChanged || skillLinkChanged || prunedCodex || codexChanged,
        codexChanged: prunedCodex || codexChanged,
        skillChanged: skillChanged || skillLinkChanged,
        skipped: !compiled.codexAgentPath,
    }
}

function performerSnapshotToCodexProjectionInput(
    workingDir: string,
    performer: CodexProjectionPerformerSnapshot,
): PerformerProjectionInput | null {
    if (
        typeof performer?.id !== 'string'
        || !performer.id
        || typeof performer.name !== 'string'
        || !performer.model
    ) {
        return null
    }

    return {
        performerId: performer.id,
        performerName: performer.name,
        talRef: performer.talRef || null,
        danceRefs: performer.danceRefs || [],
        model: performer.model,
        modelVariant: performer.modelVariant || null,
        mcpServerNames: performer.mcpServerNames || [],
        workingDir,
        scope: 'workspace',
    }
}

export async function syncCodexPerformerProjectionsForWorkspace(
    workingDir: string,
    performers: CodexProjectionPerformerSnapshot[],
) {
    const results: EnsuredCodexPerformerProjection[] = []
    let invalidSkippedCount = 0
    let failedCount = 0

    for (const performer of performers) {
        const projectionInput = performerSnapshotToCodexProjectionInput(workingDir, performer)
        if (!projectionInput) {
            invalidSkippedCount += 1
            continue
        }
        try {
            results.push(await ensureCodexPerformerProjection(projectionInput))
        } catch (error) {
            failedCount += 1
            console.warn('[codex-projection] Failed to sync performer projection', {
                workingDir,
                performerId: performer.id,
                error,
            })
        }
    }

    return {
        performerCount: performers.length,
        projectedCount: results.filter((result) => !result.skipped).length,
        skippedCount: invalidSkippedCount + results.filter((result) => result.skipped).length,
        failedCount,
        changedCount: results.filter((result) => result.changed).length,
        codexChangedCount: results.filter((result) => result.codexChanged).length,
        results,
    }
}

export async function ensurePerformerProjection(input: PerformerProjectionInput): Promise<EnsuredPerformerProjection> {
    const workspaceHash = computeWorkspaceHash(input.workingDir)
    const toolResolution = await resolveRuntimeTools(input.workingDir, input.model, input.mcpServerNames)
    const resolvedServerNames = input.mcpServerNames.filter((serverName) =>
        toolResolution.resolvedTools.includes(mcpToolPattern(serverName)),
    )
    const toolMap = buildProjectedToolMap(resolvedServerNames)
    const codexMcpServers = await resolveCodexMcpServers(input.mcpServerNames)

    if (input.extraTools) {
        for (const tool of input.extraTools) {
            toolMap[tool.name] = true
        }
    }

    const compiledSkills: CompiledSkill[] = []
    for (const ref of input.danceRefs) {
        compiledSkills.push(await compileDance(
            input.workingDir,
            ref,
            workspaceHash,
            input.performerId,
            input.workingDir,
            input.scope || 'workspace',
            input.actId,
        ))
    }

    const compileScope = input.scope === 'workspace' ? 'stage' : input.scope
    const skills = compileScope === 'act'
        ? compiledSkills
        : attachCodexSkillPaths(input.workingDir, input.performerId, compiledSkills)

    const requestTargets: RequestRelationTarget[] = (input.requestTargets || []).map((target) => ({
        performerId: target.performerId,
        performerName: target.performerName,
        agentName: getProjectedAgentName(input.workingDir, target.performerId, 'build', input.scope, input.actId),
        description: target.description || '',
    }))
    const requestProjection = compileMentionRelations(requestTargets)

    const compiled = await compilePerformer(
        input.workingDir,
        {
            performerId: input.performerId,
            performerName: input.performerName,
            talRef: input.talRef,
            model: input.model,
            modelVariant: input.modelVariant || null,
            workspaceHash,
            executionDir: input.workingDir,
            scope: compileScope || 'stage',
            actId: input.actId,
            skillNames: skills.map((skill) => skill.logicalName),
            toolMap,
            codexMcpServers,
            taskAllowlist: requestProjection.taskAllowlist,
            relationPromptSection: requestProjection.promptSection,
        } satisfies PerformerCompileInput,
        skills,
    )
    if (compileScope !== 'act') {
        compiled.allFiles.push(...skills.flatMap((skill) => (
            skill.codexLinkRelativePath ? [skill.codexLinkRelativePath] : []
        )))
    }

    let changed = false
    if (input.extraTools) {
        // Clean stale act tool files that don't belong to the current extra tools set.
        // This prevents zombie tools from deleted/renamed acts lingering in OpenCode's cache.
        const currentToolNames = new Set<string>(input.extraTools.map((t) => t.name))
        const collaborationToolNames = new Set<string>([
            ...COLLABORATION_TOOL_NAMES,
            ...STALE_COLLABORATION_TOOL_NAMES,
        ])
        const toolsDir = path.join(input.workingDir, '.opencode', 'tools')
        try {
            const existing = await fs.readdir(toolsDir)
            for (const file of existing) {
                if (file.endsWith('.ts')) {
                    const toolName = file.replace(/\.ts$/, '')
                    if (collaborationToolNames.has(toolName) && !currentToolNames.has(toolName)) {
                        await fs.rm(path.join(toolsDir, file), { force: true }).catch(() => {})
                        changed = true
                    }
                }
            }
        } catch {
            // tools dir may not exist yet
        }

        for (const tool of input.extraTools) {
            const toolPath = path.join(input.workingDir, '.opencode', 'tools', `${tool.name}.ts`)
            compiled.allFiles.push(toRelativePath(input.workingDir, toolPath))
            changed = (await writeIfChanged(toolPath, tool.content)) || changed
        }
    }

    await cleanGroupFiles(input.workingDir, groupKey(input.performerId), compiled.allFiles)

    for (const skill of skills) {
        changed = (await writeIfChanged(skill.filePath, skill.content)) || changed
        changed = skill.bundleChanged || changed
    }
    const codexSkillLinkChanged = compileScope !== 'act'
        ? await syncCodexSkillLinks(skills)
        : false
    changed = (await writeIfChanged(compiled.agentPaths.build!, compiled.agentContents.build!)) || changed
    if (compiled.agentPaths.plan && compiled.agentContents.plan) {
        changed = (await writeIfChanged(compiled.agentPaths.plan, compiled.agentContents.plan)) || changed
    }
    const codexChanged = compiled.codexAgentPath && compiled.codexAgentContent
        ? await writeIfChanged(compiled.codexAgentPath, compiled.codexAgentContent)
        : false

    await updateManifestGroup(
        input.workingDir,
        workspaceHash,
        groupKey(input.performerId),
        compiled.allFiles,
    )
    await updateGitExclude(input.workingDir)
    if (changed) {
        await markProjectionRuntimePending(input.workingDir, workspaceHash)
    }

    return {
        compiled,
        toolResolution,
        toolMap,
        capabilitySnapshot: await resolveCapabilitySnapshot(input.workingDir, input.model),
        changed,
        codexChanged: codexChanged || codexSkillLinkChanged,
    }
}

export function getProjectedAgentName(
    workingDir: string,
    performerId: string,
    posture: Posture,
    scope: 'workspace' | 'act' = 'workspace',
    actId?: string,
) {
    const workspaceHash = computeWorkspaceHash(workingDir)
    return resolveAgentIdentity({
        executionDir: workingDir,
        workspaceHash,
        performerId,
        posture,
        scope,
        actId,
    }).agentName
}
