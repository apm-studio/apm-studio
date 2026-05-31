import fs from 'fs/promises'
import path from 'path'
import type {
    ApmPackageManifest,
    MicrosoftApmPrimitiveCounts,
    MicrosoftApmPackageSourceSummary,
} from '../../../shared/apm-contracts.js'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'
import { getApmUserScopeCwd } from '../../lib/apm-studio-paths.js'
import { readDraft, readDraftTextContent } from '../drafts/service.js'
import {
    skillBundleDir,
    isSkillBundleDraft,
    readBundleSkillContent,
} from '../drafts/skill-bundle-service.js'
import { syncSkillBundleSiblings } from '../opencode-projection/skill-bundle-sync.js'
import { packageDir, sourceDir, toPosixPath } from './paths.js'
import { yamlString } from './yaml-io.js'

type MaterializedSkill = {
    logicalName: string
    relativePath: string
}

function slugifySegment(value: string, fallback = 'agent') {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-._]+|[-._]+$/g, '')
    return slug || fallback
}

function uniqueSegment(value: string, used: Set<string>) {
    const base = slugifySegment(value)
    let candidate = base
    let index = 2
    while (used.has(candidate)) {
        candidate = `${base}-${index}`
        index += 1
    }
    used.add(candidate)
    return candidate
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

function hasMarkdownFrontmatter(content: string) {
    return content.trimStart().startsWith('---\n')
}

function skillContent(name: string, description: string, content: string) {
    if (hasMarkdownFrontmatter(content)) {
        return content.trimEnd() + '\n'
    }
    return `${frontmatter({
        description: description || 'Generated skill',
        name,
    })}\n\n${content.trimEnd()}\n`
}

async function writeText(filePath: string, content: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
}

async function copyDirectory(source: string, target: string) {
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.rm(target, { recursive: true, force: true })
    await fs.cp(source, target, { recursive: true })
}

function workspaceRelative(workingDir: string, filePath: string) {
    return toPosixPath(path.relative(workingDir, filePath))
}

function localPackageRef(relativePath: string) {
    return relativePath.startsWith('.') || path.isAbsolute(relativePath)
        ? relativePath
        : `./${relativePath}`
}

function packageRelative(root: string, filePath: string) {
    return toPosixPath(path.relative(root, filePath))
}

function quoteShellArg(value: string) {
    if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
        return value
    }
    return `'${value.replace(/'/g, "'\\''")}'`
}

async function resolveInstructionContent(
    workingDir: string,
    ref: SharedPrimitiveRef | null | undefined,
) {
    if (!ref) return null
    if (ref.kind === 'draft') {
        return readDraftTextContent(workingDir, 'instruction', ref.draftId)
    }
    const packageRef = parseApmPackageRef(ref)
    if (packageRef) {
        return resolvePackageInstructionContent(workingDir, packageRef)
    }
    throw new Error('Registry instruction references are no longer supported. Import the source as an APM package primitive instead.')
}

type ApmPackageRef = {
    scope: 'workspace' | 'user'
    packageId: string
}

function parseApmPackageRef(ref: SharedPrimitiveRef): ApmPackageRef | null {
    if (ref.kind !== 'registry') return null
    const match = ref.urn.match(/^apm-package\/(workspace|user)\/(.+)$/)
    if (!match) return null
    return {
        scope: match[1] as ApmPackageRef['scope'],
        packageId: match[2],
    }
}

function packageRefWorkingDir(workingDir: string, ref: ApmPackageRef) {
    return ref.scope === 'user' ? getApmUserScopeCwd() : workingDir
}

async function firstFileInDirectory(dir: string, predicate: (entryName: string) => boolean) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    return entries
        .filter((entry) => entry.isFile() && predicate(entry.name))
        .map((entry) => path.join(dir, entry.name))
        .sort((left, right) => left.localeCompare(right))[0] || null
}

async function resolvePackageInstructionContent(workingDir: string, ref: ApmPackageRef) {
    const instructionsDir = path.join(sourceDir(packageRefWorkingDir(workingDir, ref), ref.packageId), 'instructions')
    const instructionFile = await firstFileInDirectory(instructionsDir, (name) => name.endsWith('.md'))
    if (!instructionFile) {
        throw new Error(`APM package '${ref.packageId}' has no instruction primitive.`)
    }
    return fs.readFile(instructionFile, 'utf-8')
}

async function materializeDraftSkill(
    workingDir: string,
    ref: Extract<SharedPrimitiveRef, { kind: 'draft' }>,
    targetDir: string,
    usedNames: Set<string>,
): Promise<MaterializedSkill> {
    const isBundle = await isSkillBundleDraft(workingDir, ref.draftId)
    const draft = await readDraft(workingDir, 'skill', ref.draftId)
    const body = isBundle
        ? await readBundleSkillContent(workingDir, ref.draftId)
        : (typeof draft?.content === 'string' ? draft.content : null)
    if (!body) {
        throw new Error(`Skill draft '${ref.draftId}' has no local content.`)
    }

    const logicalName = uniqueSegment(draft?.name || ref.draftId, usedNames)
    const description = typeof draft?.description === 'string' && draft.description.trim()
        ? draft.description
        : logicalName
    const skillDir = path.join(targetDir, logicalName)
    const skillFile = path.join(skillDir, 'SKILL.md')

    await writeText(skillFile, skillContent(logicalName, description, body))
    if (isBundle) {
        await syncSkillBundleSiblings(skillBundleDir(workingDir, ref.draftId), skillDir, {
            excludedNames: ['SKILL.md', 'draft.json'],
        })
    }

    return {
        logicalName,
        relativePath: packageRelative(path.dirname(path.dirname(targetDir)), skillFile),
    }
}

async function materializePackageSkills(
    workingDir: string,
    ref: ApmPackageRef,
    targetDir: string,
    usedNames: Set<string>,
): Promise<MaterializedSkill[]> {
    const packageSkillsDir = path.join(sourceDir(packageRefWorkingDir(workingDir, ref), ref.packageId), 'skills')
    const entries = await fs.readdir(packageSkillsDir, { withFileTypes: true }).catch(() => [])
    const skillDirs = entries
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))

    if (skillDirs.length === 0) {
        throw new Error(`APM package '${ref.packageId}' has no skill primitives.`)
    }

    const materialized: MaterializedSkill[] = []
    for (const entry of skillDirs) {
        const sourceSkillDir = path.join(packageSkillsDir, entry.name)
        const sourceSkillFile = path.join(sourceSkillDir, 'SKILL.md')
        await fs.access(sourceSkillFile)
        const logicalName = uniqueSegment(entry.name, usedNames)
        const targetSkillDir = path.join(targetDir, logicalName)
        await copyDirectory(sourceSkillDir, targetSkillDir)
        materialized.push({
            logicalName,
            relativePath: packageRelative(path.dirname(path.dirname(targetDir)), path.join(targetSkillDir, 'SKILL.md')),
        })
    }

    return materialized
}

async function materializeSkills(
    workingDir: string,
    ref: SharedPrimitiveRef,
    targetDir: string,
    usedNames: Set<string>,
): Promise<MaterializedSkill[]> {
    if (ref.kind === 'draft') {
        return [await materializeDraftSkill(workingDir, ref, targetDir, usedNames)]
    }
    const packageRef = parseApmPackageRef(ref)
    if (packageRef) {
        return materializePackageSkills(workingDir, packageRef, targetDir, usedNames)
    }
    throw new Error('Registry skill references are no longer supported. Import the source as an APM package primitive instead.')
}

async function discoverPrimitivePaths(dir: string) {
    const result: string[] = []
    async function walk(current: string) {
        const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
            const next = path.join(current, entry.name)
            if (entry.isDirectory()) {
                await walk(next)
            } else if (entry.isFile()) {
                result.push(next)
            }
        }
    }
    await walk(dir)
    return result.sort((left, right) => left.localeCompare(right))
}

function countPrimitives(relativePaths: string[]) {
    const promptCount = relativePaths.filter((entry) =>
        entry.startsWith('.apm/prompts/') && entry.endsWith('.prompt.md'),
    ).length
    return {
        agents: relativePaths.filter((entry) => entry.startsWith('.apm/agents/')).length,
        instructions: relativePaths.filter((entry) => entry.startsWith('.apm/instructions/')).length,
        skills: relativePaths.filter((entry) => entry.startsWith('.apm/skills/') && entry.endsWith('/SKILL.md')).length,
        prompts: promptCount,
        commands: promptCount,
        hooks: relativePaths.filter((entry) => entry.startsWith('.apm/hooks/') && entry.endsWith('.json')).length,
    }
}

function countMcpDependencies(manifest: ApmPackageManifest) {
    return Array.isArray(manifest.dependencies?.mcp)
        ? manifest.dependencies.mcp.length
        : 0
}

function agentName(agent: NonNullable<ApmPackageManifest['x-apm']>['agent']) {
    return agent?.agentName || 'Agent'
}

function agentBody(agent: NonNullable<ApmPackageManifest['x-apm']>['agent']) {
    const body = agent?.agentBody
    return typeof body === 'string' && body.trim() ? body.trim() : null
}

function instructionRef(agent: NonNullable<ApmPackageManifest['x-apm']>['agent']) {
    return agent?.instructionRef || null
}

function skillRefs(agent: NonNullable<ApmPackageManifest['x-apm']>['agent']) {
    return agent?.skillRefs || []
}

function summaryWarnings(
    manifest: ApmPackageManifest,
    primitiveCounts: MicrosoftApmPrimitiveCounts,
    generationWarnings: string[] = [],
) {
    const warnings = [...generationWarnings]
    if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
        warnings.push('APM manifests require a version field.')
    }
    if (manifest.includes !== 'auto' && !Array.isArray(manifest.includes)) {
        warnings.push('Set includes: auto or an explicit includes list for Microsoft APM packaging.')
    }
    const agent = manifest['x-apm']?.agent
    if (agent) {
        const expectedSkills = skillRefs(agent).length
        if (primitiveCounts.skills < expectedSkills) {
            warnings.push('Some Studio skill references could not be materialized into .apm/skills.')
        }
        if (primitiveCounts.agents === 0) {
            warnings.push('No Microsoft APM agent primitive was materialized.')
        }
    }
    const primitiveTotal = primitiveCounts.agents
        + primitiveCounts.instructions
        + primitiveCounts.skills
        + (primitiveCounts.prompts || 0)
        + (primitiveCounts.hooks || 0)
        + (primitiveCounts.mcp || 0)
    if (primitiveTotal === 0) {
        warnings.push('No Microsoft APM source primitives were found under .apm/.')
    }
    return Array.from(new Set(warnings))
}

export async function summarizeMicrosoftApmPackageSource(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
    generationWarnings: string[] = [],
): Promise<MicrosoftApmPackageSourceSummary> {
    const root = packageDir(workingDir, packageId)
    const source = sourceDir(workingDir, packageId)
    const rootRelative = workspaceRelative(workingDir, root)
    const sourceRelative = workspaceRelative(workingDir, source)
    const primitivePaths = (await discoverPrimitivePaths(source))
        .map((filePath) => packageRelative(root, filePath))
    const sourcePrimitiveCounts = countPrimitives(primitivePaths)
    const mcpCount = countMcpDependencies(manifest)
    const primitiveCounts = mcpCount > 0
        ? { ...sourcePrimitiveCounts, mcp: mcpCount }
        : sourcePrimitiveCounts

    return {
        packageRoot: rootRelative,
        sourceDir: sourceRelative,
        installCommand: `apm install ${quoteShellArg(localPackageRef(rootRelative))} --target codex`,
        validateCommand: `(cd ${quoteShellArg(rootRelative)} && apm compile --validate)`,
        packCommand: `(cd ${quoteShellArg(rootRelative)} && apm pack --archive)`,
        primitiveCounts,
        primitivePaths,
        warnings: summaryWarnings(manifest, primitiveCounts, generationWarnings),
    }
}

export async function syncMicrosoftApmSourceTree(
    workingDir: string,
    packageId: string,
    manifest: ApmPackageManifest,
) {
    const agent = manifest['x-apm']?.agent
    if (!agent) {
        return summarizeMicrosoftApmPackageSource(workingDir, packageId, manifest)
    }

    const apmDir = sourceDir(workingDir, packageId)
    const agentDir = path.join(apmDir, 'agents')
    const instructionDir = path.join(apmDir, 'instructions')
    const skillDir = path.join(apmDir, 'skills')
    const warnings: string[] = []

    await Promise.all([
        fs.rm(agentDir, { recursive: true, force: true }),
        fs.rm(instructionDir, { recursive: true, force: true }),
        fs.rm(skillDir, { recursive: true, force: true }),
    ])

    const resolvedAgentName = agentName(agent)
    const agentSlug = slugifySegment(resolvedAgentName || packageId)
    const instruction = await resolveInstructionContent(
        workingDir,
        instructionRef(agent),
    ).catch((error) => {
        warnings.push(error instanceof Error ? error.message : 'Unable to materialize instruction content.')
        return null
    })

    if (instruction) {
        await writeText(
            path.join(instructionDir, `${agentSlug}.instructions.md`),
            `${frontmatter({
                applyTo: '**',
                description: `${resolvedAgentName} instructions`,
            })}\n\n${instruction.trimEnd()}\n`,
        )
    }

    const usedSkillNames = new Set<string>()
    const materializedSkills: MaterializedSkill[] = []
    for (const ref of skillRefs(agent)) {
        try {
            materializedSkills.push(...await materializeSkills(workingDir, ref, skillDir, usedSkillNames))
        } catch (error) {
            const label = ref.kind === 'registry' ? ref.urn : ref.draftId
            warnings.push(error instanceof Error
                ? error.message
            : `Unable to materialize skill '${label}'.`)
        }
    }
    const description = agent.description?.trim()
        || `${resolvedAgentName} agent package for APM Studio`
    const body = agentBody(agent) || `You are ${resolvedAgentName}.`

    await writeText(
        path.join(agentDir, `${agentSlug}.agent.md`),
        `${frontmatter({
            description,
            name: agentSlug,
        })}\n\n${body.trimEnd()}\n`,
    )

    return summarizeMicrosoftApmPackageSource(workingDir, packageId, manifest, warnings)
}
