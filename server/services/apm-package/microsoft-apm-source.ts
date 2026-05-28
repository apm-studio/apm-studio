import fs from 'fs/promises'
import path from 'path'
import type {
    ApmPackageManifest,
    MicrosoftApmPackageSourceSummary,
} from '../../../shared/apm-contracts.js'
import type { SharedAssetRef } from '../../../shared/chat-contracts.js'
import { getAssetPayload, readAsset, danceAssetDir } from '../../lib/apm-asset-source.js'
import { readDraft, readDraftTextContent } from '../draft-service.js'
import {
    danceBundleDir,
    isDanceBundleDraft,
    readBundleSkillContent,
} from '../dance-bundle-service.js'
import { syncSkillBundleSiblings } from '../opencode-projection/skill-bundle-sync.js'
import { packageDirForRead, sourceDir, sourceDirForRead, toPosixPath } from './paths.js'
import { isRecord, yamlString } from './yaml-io.js'

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

function workspaceRelative(workingDir: string, filePath: string) {
    return toPosixPath(path.relative(workingDir, filePath))
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

function parseUrnName(urn: string) {
    const parts = urn.split('/')
    return parts[3] || parts.at(-1) || urn
}

function assetDescription(value: unknown, fallback: string) {
    if (isRecord(value)) {
        if (typeof value.description === 'string' && value.description.trim()) {
            return value.description
        }
        if (typeof value.summary === 'string' && value.summary.trim()) {
            return value.summary
        }
        if (typeof value.name === 'string' && value.name.trim()) {
            return value.name
        }
    }
    return fallback
}

async function resolveInstructionContent(
    workingDir: string,
    ref: SharedAssetRef | null | undefined,
) {
    if (!ref) return null
    if (ref.kind === 'registry') {
        return getAssetPayload(workingDir, ref.urn)
    }
    return readDraftTextContent(workingDir, 'tal', ref.draftId)
}

async function materializeRegistrySkill(
    workingDir: string,
    ref: Extract<SharedAssetRef, { kind: 'registry' }>,
    targetDir: string,
    usedNames: Set<string>,
): Promise<MaterializedSkill> {
    const body = await getAssetPayload(workingDir, ref.urn)
    if (!body) {
        throw new Error(`Skill '${ref.urn}' has no local content.`)
    }
    const asset = await readAsset(workingDir, ref.urn)
    const logicalName = uniqueSegment(parseUrnName(ref.urn), usedNames)
    const description = assetDescription(asset, logicalName)
    const skillDir = path.join(targetDir, logicalName)
    const skillFile = path.join(skillDir, 'SKILL.md')

    await writeText(skillFile, skillContent(logicalName, description, body))
    await syncSkillBundleSiblings(danceAssetDir(workingDir, ref.urn), skillDir, {
        excludedNames: ['SKILL.md', 'draft.json'],
    })

    return {
        logicalName,
        relativePath: packageRelative(path.dirname(path.dirname(targetDir)), skillFile),
    }
}

async function materializeDraftSkill(
    workingDir: string,
    ref: Extract<SharedAssetRef, { kind: 'draft' }>,
    targetDir: string,
    usedNames: Set<string>,
): Promise<MaterializedSkill> {
    const isBundle = await isDanceBundleDraft(workingDir, ref.draftId)
    const draft = await readDraft(workingDir, 'dance', ref.draftId)
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
        await syncSkillBundleSiblings(danceBundleDir(workingDir, ref.draftId), skillDir, {
            excludedNames: ['SKILL.md', 'draft.json'],
        })
    }

    return {
        logicalName,
        relativePath: packageRelative(path.dirname(path.dirname(targetDir)), skillFile),
    }
}

async function materializeSkill(
    workingDir: string,
    ref: SharedAssetRef,
    targetDir: string,
    usedNames: Set<string>,
) {
    return ref.kind === 'registry'
        ? materializeRegistrySkill(workingDir, ref, targetDir, usedNames)
        : materializeDraftSkill(workingDir, ref, targetDir, usedNames)
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
    return {
        agents: relativePaths.filter((entry) => entry.startsWith('.apm/agents/')).length,
        instructions: relativePaths.filter((entry) => entry.startsWith('.apm/instructions/')).length,
        skills: relativePaths.filter((entry) => entry.startsWith('.apm/skills/') && entry.endsWith('/SKILL.md')).length,
    }
}

function agentName(agent: NonNullable<ApmPackageManifest['x-apm']>['agent']) {
    return agent?.agentName || agent?.performerName || 'Agent'
}

function agentBody(agent: NonNullable<ApmPackageManifest['x-apm']>['agent']) {
    const body = agent?.agentBody ?? agent?.inlineInstruction
    return typeof body === 'string' && body.trim() ? body.trim() : null
}

function instructionRef(agent: NonNullable<ApmPackageManifest['x-apm']>['agent']) {
    return agent?.instructionRef || agent?.talRef || null
}

function skillRefs(agent: NonNullable<ApmPackageManifest['x-apm']>['agent']) {
    return agent?.skillRefs || agent?.danceRefs || []
}

function summaryWarnings(
    manifest: ApmPackageManifest,
    primitiveCounts: ReturnType<typeof countPrimitives>,
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
    if (primitiveCounts.agents + primitiveCounts.instructions + primitiveCounts.skills === 0) {
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
    const root = await packageDirForRead(workingDir, packageId)
    const source = await sourceDirForRead(workingDir, packageId)
    const rootRelative = workspaceRelative(workingDir, root)
    const sourceRelative = workspaceRelative(workingDir, source)
    const primitivePaths = (await discoverPrimitivePaths(source))
        .map((filePath) => packageRelative(root, filePath))
        .filter((filePath) => !filePath.startsWith('.apm/prompts/'))
    const primitiveCounts = countPrimitives(primitivePaths)

    return {
        packageRoot: rootRelative,
        sourceDir: sourceRelative,
        installCommand: `apm install ${quoteShellArg(rootRelative)} --target codex`,
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
            materializedSkills.push(await materializeSkill(workingDir, ref, skillDir, usedSkillNames))
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
