import fs from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import type {
    AgentSyncPerformerStatus,
    AgentSyncProviderSummary,
    AgentSyncRunRequest,
    AgentSyncRunResponse,
    AgentSyncRunResult,
    AgentSyncStatus,
    AgentSyncStatusCounts,
} from '../../../shared/agent-sync-contracts.js'
import { getAssetPayload, getRosterDir, readAsset } from '../../lib/roster-source.js'
import { listApmAgentProjectionSnapshots } from '../apm-package-service.js'
import {
    danceBundleDir,
    isDanceBundleDraft,
    readBundleSkillContent,
} from '../dance-bundle-service.js'
import { compileDance, type CompiledSkill } from '../opencode-projection/dance-compiler.js'
import {
    compilePerformer,
    resolveCodexProjectAgentModelId,
    type PerformerCompileInput,
} from '../opencode-projection/performer-compiler.js'
import type { PerformerProjectionInput } from '../opencode-projection/performer-projection-types.js'
import {
    isCodexImmediateProjectionPath,
    attachCodexSkillPaths,
    performerSnapshotToCodexProjectionInput,
    resolveCodexMcpServers,
    syncCodexSkillLinks,
    updateCodexProjectionManifestGroup,
} from '../opencode-projection/codex-projection-helpers.js'
import {
    localSkillProjectionDir,
    readManifest,
    toRelativePath,
    updateGitExclude,
    writeManifest,
} from '../opencode-projection/projection-manifest.js'

const PROVIDER_ID = 'codex'
const PROVIDER_LABEL = 'Codex'

type WorkspacePerformer = Awaited<ReturnType<typeof listApmAgentProjectionSnapshots>>[number]

type CodexProjectionPlan = {
    status: AgentSyncPerformerStatus
    expectedFiles: string[]
    compiledAgentPath?: string
    compiledAgentContent?: string
    skills: CompiledSkill[]
}

type StaleArtifact = {
    groupKey: string
    filePath: string
}

function computeWorkspaceHash(workingDir: string) {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 12)
}

function groupKey(performerId: string) {
    return `performer:${performerId}`
}

function createStatusCounts(): AgentSyncStatusCounts {
    return {
        synced: 0,
        stale: 0,
        unsupported: 0,
        invalid: 0,
        failed: 0,
    }
}

function incrementStatusCount(counts: AgentSyncStatusCounts, status: AgentSyncStatus) {
    counts[status] += 1
}

function sanitizeSegment(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
}

function extractDraftDescription(draft: { description?: string; content?: unknown } | undefined | null): string {
    if (!draft) {
        return ''
    }
    if (typeof draft.description === 'string') {
        return draft.description
    }
    if (draft.content && typeof draft.content === 'object') {
        const content = draft.content as Record<string, unknown>
        if (typeof content.description === 'string') {
            return content.description
        }
    }
    return ''
}

function parseUrn(urn: string) {
    const parts = urn.split('/')
    const ownerWithAt = parts[1] ?? ''
    const stage = parts[2] ?? ''
    const name = parts[3] ?? ''
    return {
        author: sanitizeSegment(ownerWithAt.replace(/^@/, '')),
        stage: sanitizeSegment(stage),
        slug: sanitizeSegment(name),
    }
}

function buildFrontmatter(name: string, description: string) {
    return [
        '---',
        `name: ${JSON.stringify(name)}`,
        `description: ${JSON.stringify(description || 'Generated skill')}`,
        '---',
    ].join('\n')
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

async function compileDanceReadOnly(
    cwd: string,
    ref: PerformerProjectionInput['danceRefs'][number],
    workspaceHash: string,
    performerId: string,
): Promise<CompiledSkill> {
    if (ref.kind === 'registry') {
        const asset = await readAsset(cwd, ref.urn)
        const body = await getAssetPayload(cwd, ref.urn)
        if (!body) {
            throw new Error(`Skill '${ref.urn}' was not found or has no content.`)
        }

        const parsed = parseUrn(ref.urn)
        const logicalName = parsed.slug
        const description = typeof asset?.description === 'string' ? asset.description : parsed.slug
        const skillDir = path.join(
            localSkillProjectionDir(cwd, workspaceHash, performerId, 'workspace'),
            logicalName,
        )
        const filePath = path.join(skillDir, 'SKILL.md')

        return {
            logicalName,
            description,
            filePath,
            relativePath: toRelativePath(cwd, filePath),
            content: `${buildFrontmatter(logicalName, description)}\n\n${body}`,
            additionalFiles: [],
            bundleChanged: false,
        }
    }

    if (await isDanceBundleDraft(cwd, ref.draftId)) {
        const body = await readBundleSkillContent(cwd, ref.draftId)
        if (!body) {
            throw new Error(`Skill draft '${ref.draftId}' is missing SKILL.md.`)
        }
        const draft = await readJsonFile<{ name?: string; description?: string; content?: unknown }>(
            path.join(danceBundleDir(cwd, ref.draftId), 'draft.json'),
        )
        const logicalName = sanitizeSegment(draft?.name || ref.draftId)
        const description = extractDraftDescription(draft) || draft?.name || 'Draft skill'
        const filePath = path.join(
            localSkillProjectionDir(cwd, workspaceHash, performerId, 'workspace'),
            logicalName,
            'SKILL.md',
        )

        return {
            logicalName,
            description,
            filePath,
            relativePath: toRelativePath(cwd, filePath),
            content: `${buildFrontmatter(logicalName, description)}\n\n${body}`,
            additionalFiles: [],
            bundleChanged: false,
        }
    }

    const draft = await readJsonFile<{ name?: string; description?: string; content?: unknown }>(
        path.join(getRosterDir(cwd), 'drafts', 'dance', `${ref.draftId}.json`),
    )
    const body = typeof draft?.content === 'string' ? draft.content : null
    if (!draft || !body) {
        throw new Error(`Skill draft '${ref.draftId}' was not found or has no content.`)
    }

    const logicalName = sanitizeSegment(draft.name || ref.draftId)
    const description = extractDraftDescription(draft) || draft.name || 'Draft skill'
    const filePath = path.join(
        localSkillProjectionDir(cwd, workspaceHash, performerId, 'workspace'),
        logicalName,
        'SKILL.md',
    )

    return {
        logicalName,
        description,
        filePath,
        relativePath: toRelativePath(cwd, filePath),
        content: `${buildFrontmatter(logicalName, description)}\n\n${body}`,
        additionalFiles: [],
        bundleChanged: false,
    }
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

async function linkMatches(skill: CompiledSkill) {
    if (!skill.codexLinkPath) {
        return false
    }
    const current = await fs.lstat(skill.codexLinkPath).catch(() => null)
    if (!current?.isSymbolicLink()) {
        return false
    }
    const targetDir = path.dirname(skill.filePath)
    const expectedTarget = process.platform === 'win32'
        ? targetDir
        : path.relative(path.dirname(skill.codexLinkPath), targetDir)
    const currentTarget = await fs.readlink(skill.codexLinkPath).catch(() => null)
    if (currentTarget === expectedTarget) {
        return true
    }
    return fs.realpath(skill.codexLinkPath)
        .then(async (realPath) => realPath === await fs.realpath(targetDir))
        .catch(() => false)
}

async function fileMatches(filePath: string | undefined, content: string | undefined) {
    if (!filePath || content === undefined) {
        return false
    }
    return fs.readFile(filePath, 'utf-8')
        .then((current) => current === content)
        .catch(() => false)
}

async function mtimeMs(filePath: string | undefined) {
    if (!filePath) {
        return undefined
    }
    const stat = await fs.stat(filePath).catch(() => null)
    return stat?.mtimeMs
}

function currentFilesFor(compiled: Awaited<ReturnType<typeof compilePerformer>>, skills: CompiledSkill[]) {
    return [
        ...(compiled.codexAgentRelativePath ? [compiled.codexAgentRelativePath] : []),
        ...skills.flatMap((skill) => [
            skill.relativePath,
            ...(skill.codexLinkRelativePath ? [skill.codexLinkRelativePath] : []),
            ...skill.additionalFiles,
        ]),
    ]
}

async function buildCodexPlan(
    workingDir: string,
    performer: WorkspacePerformer,
): Promise<CodexProjectionPlan> {
    const baseStatus = {
        providerId: PROVIDER_ID,
        performerId: performer.id,
        performerName: performer.name,
        model: performer.model || null,
    }

    const projectionInput = performerSnapshotToCodexProjectionInput(workingDir, performer)
    if (!projectionInput) {
        return {
            status: {
                ...baseStatus,
                status: 'invalid',
                reason: 'Agent is missing a name or model selection.',
            },
            expectedFiles: [],
            skills: [],
        }
    }

    const codexModelId = resolveCodexProjectAgentModelId(projectionInput.model)
    if (!codexModelId) {
        return {
            status: {
                ...baseStatus,
                status: 'unsupported',
                reason: 'Codex project agents support only selected OpenAI Codex-capable models.',
            },
            expectedFiles: [],
            skills: [],
        }
    }

    try {
        const workspaceHash = computeWorkspaceHash(workingDir)
        const compiledSkills: CompiledSkill[] = []
        for (const ref of projectionInput.danceRefs) {
            compiledSkills.push(await compileDanceReadOnly(
                workingDir,
                ref,
                workspaceHash,
                projectionInput.performerId,
            ))
        }
        const skills = attachCodexSkillPaths(workingDir, projectionInput.performerId, compiledSkills)
        const codexMcpServers = await resolveCodexMcpServers(projectionInput.mcpServerNames)
        const compiled = await compilePerformer(
            workingDir,
            {
                performerId: projectionInput.performerId,
                performerName: projectionInput.performerName,
                talRef: projectionInput.talRef,
                inlineInstruction: projectionInput.inlineInstruction || null,
                model: projectionInput.model,
                modelVariant: projectionInput.modelVariant || null,
                workspaceHash,
                executionDir: workingDir,
                scope: 'stage',
                skillNames: skills.map((skill) => skill.logicalName),
                toolMap: {},
                codexMcpServers,
                includeCodexAgent: true,
                relationPromptSection: null,
            } satisfies PerformerCompileInput,
            skills,
        )
        const expectedFiles = currentFilesFor(compiled, skills)
        const manifest = await readManifest(workingDir)
        const manifestFiles = new Set(manifest?.groups[groupKey(projectionInput.performerId)] || [])
        const manifestMatches = expectedFiles.every((file) => manifestFiles.has(file))
        const agentMatches = await fileMatches(compiled.codexAgentPath, compiled.codexAgentContent)
        const skillsMatch = await Promise.all(skills.map(async (skill) => (
            await fileMatches(skill.filePath, skill.content)
                && await linkMatches(skill)
        )))
        const status: AgentSyncStatus = agentMatches && skillsMatch.every(Boolean) && manifestMatches
            ? 'synced'
            : 'stale'

        return {
            status: {
                ...baseStatus,
                status,
                reason: status === 'synced'
                    ? 'Codex agent, skills, links, and manifest match the current agent.'
                    : 'Codex export is missing or differs from the current agent.',
                lastSyncedAt: await mtimeMs(compiled.codexAgentPath),
                agentName: compiled.codexAgentName,
            },
            expectedFiles,
            compiledAgentPath: compiled.codexAgentPath,
            compiledAgentContent: compiled.codexAgentContent,
            skills,
        }
    } catch (error) {
        return {
            status: {
                ...baseStatus,
                status: 'failed',
                reason: error instanceof Error ? error.message : 'Unable to calculate Codex sync status.',
            },
            expectedFiles: [],
            skills: [],
        }
    }
}

async function buildPlans(workingDir: string, performers: WorkspacePerformer[]) {
    const plans: CodexProjectionPlan[] = []
    for (const performer of performers) {
        plans.push(await buildCodexPlan(workingDir, performer))
    }
    return plans
}

async function findStaleArtifacts(workingDir: string, plans: CodexProjectionPlan[]): Promise<StaleArtifact[]> {
    const manifest = await readManifest(workingDir)
    if (!manifest) {
        return []
    }
    const expectedByGroup = new Map(
        plans.map((plan) => [
            groupKey(plan.status.performerId),
            new Set(plan.expectedFiles.filter(isCodexImmediateProjectionPath)),
        ]),
    )
    const stale: StaleArtifact[] = []
    for (const [key, files] of Object.entries(manifest.groups)) {
        const expectedFiles = expectedByGroup.get(key) || new Set<string>()
        for (const file of files) {
            if (isCodexImmediateProjectionPath(file) && !expectedFiles.has(file)) {
                stale.push({ groupKey: key, filePath: file })
            }
        }
    }
    return stale
}

async function pruneStaleArtifacts(workingDir: string, staleArtifacts: StaleArtifact[]) {
    if (staleArtifacts.length === 0) {
        return 0
    }
    const manifest = await readManifest(workingDir)
    if (!manifest) {
        return 0
    }

    let prunedCount = 0
    const staleByGroup = new Map<string, Set<string>>()
    for (const artifact of staleArtifacts) {
        const files = staleByGroup.get(artifact.groupKey) || new Set<string>()
        files.add(artifact.filePath)
        staleByGroup.set(artifact.groupKey, files)
    }

    for (const [key, staleFiles] of staleByGroup) {
        const previous = manifest.groups[key] || []
        for (const file of staleFiles) {
            await fs.rm(path.join(workingDir, file), { force: true, recursive: true }).catch(() => {})
            prunedCount += 1
        }
        const next = previous.filter((file) => !staleFiles.has(file))
        if (next.length > 0) {
            manifest.groups[key] = next
        } else {
            delete manifest.groups[key]
        }
    }

    await writeManifest(workingDir, manifest)
    return prunedCount
}

export async function getCodexAgentSyncOverview(workingDir: string): Promise<{
    provider: AgentSyncProviderSummary
    performers: AgentSyncPerformerStatus[]
}> {
    const performers = await listApmAgentProjectionSnapshots(workingDir)
    const plans = await buildPlans(workingDir, performers)
    const staleArtifacts = await findStaleArtifacts(workingDir, plans)
    const statusCounts = createStatusCounts()
    for (const plan of plans) {
        incrementStatusCount(statusCounts, plan.status.status)
    }

    return {
        provider: {
            id: PROVIDER_ID,
            label: PROVIDER_LABEL,
            available: true,
            statusCounts,
            staleArtifactsCount: staleArtifacts.length,
            lastCheckedAt: Date.now(),
        },
        performers: plans.map((plan) => plan.status),
    }
}

export async function ensureCodexPerformerProjection(
    input: PerformerProjectionInput,
): Promise<{
    performerId: string
    codexAgentName?: string
    codexAgentPath?: string
    codexAgentRelativePath?: string
    changed: boolean
    codexChanged: boolean
    skillChanged: boolean
    skipped: boolean
}> {
    const workspaceHash = computeWorkspaceHash(input.workingDir)
    const codexModelId = resolveCodexProjectAgentModelId(input.model)

    if (!codexModelId) {
        return {
            performerId: input.performerId,
            changed: false,
            codexChanged: false,
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
            inlineInstruction: input.inlineInstruction || null,
            model: input.model,
            modelVariant: input.modelVariant || null,
            workspaceHash,
            executionDir: input.workingDir,
            scope: 'stage',
            skillNames: skills.map((skill) => skill.logicalName),
            toolMap: {},
            codexMcpServers,
            includeCodexAgent: true,
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

    const currentFiles = currentFilesFor(compiled, skills)
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

function toRunResult(
    status: AgentSyncPerformerStatus,
    changed: boolean,
    skipped: boolean,
): AgentSyncRunResult {
    return {
        ...status,
        changed,
        skipped,
    }
}

export async function syncCodexAgentSync(
    workingDir: string,
    request: AgentSyncRunRequest = {},
): Promise<AgentSyncRunResponse> {
    const selectedIds = new Set((request.performerIds || []).filter(Boolean))
    const allPerformers = await listApmAgentProjectionSnapshots(workingDir)
    const performers = selectedIds.size > 0
        ? allPerformers.filter((performer) => selectedIds.has(performer.id))
        : allPerformers

    const results: AgentSyncRunResult[] = []
    for (const performer of performers) {
        const input = performerSnapshotToCodexProjectionInput(workingDir, performer)
        const plan = await buildCodexPlan(workingDir, performer)
        if (!input || plan.status.status === 'invalid' || plan.status.status === 'unsupported') {
            results.push(toRunResult(plan.status, false, true))
            continue
        }

        try {
            const projection = await ensureCodexPerformerProjection(input)
            const refreshed = await buildCodexPlan(workingDir, performer)
            results.push(toRunResult(refreshed.status, projection.changed, projection.skipped))
        } catch (error) {
            results.push(toRunResult({
                ...plan.status,
                status: 'failed',
                reason: error instanceof Error ? error.message : 'Unable to sync Codex export.',
            }, false, false))
        }
    }

    return {
        providerId: PROVIDER_ID,
        projectedCount: results.filter((result) => !result.skipped && result.status !== 'failed').length,
        skippedCount: results.filter((result) => result.skipped).length,
        failedCount: results.filter((result) => result.status === 'failed').length,
        changedCount: results.filter((result) => result.changed).length,
        staleArtifactsPrunedCount: 0,
        results,
    }
}

export async function pruneCodexAgentSync(workingDir: string): Promise<AgentSyncRunResponse> {
    const performers = await listApmAgentProjectionSnapshots(workingDir)
    const plans = await buildPlans(workingDir, performers)
    const staleArtifacts = await findStaleArtifacts(workingDir, plans)
    const prunedCount = await pruneStaleArtifacts(workingDir, staleArtifacts)

    return {
        providerId: PROVIDER_ID,
        projectedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        changedCount: prunedCount > 0 ? 1 : 0,
        staleArtifactsPrunedCount: prunedCount,
        results: plans.map((plan) => toRunResult(plan.status, false, true)),
    }
}
