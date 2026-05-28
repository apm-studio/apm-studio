import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import type {
    ApmDependency,
    ApmExportUnit,
    ApmPackageManifest,
    ApmSyncPackageResult,
    ApmSyncTargetId,
} from '../../../shared/apm-contracts.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import { readManifestFile } from '../apm-package/package-files.js'
import {
    manifestPathForRead,
    sourceDirForRead,
    toPosixPath,
} from '../apm-package/paths.js'
import { isRecord, yamlString } from '../apm-package/yaml-io.js'

type ProjectionFidelity = 'subagent' | 'native-agent' | 'skill-adapter' | 'unsupported'

type AgentProjectionTargetProfile = {
    id: ApmSyncTargetId
    label: string
    description: string
    projectedAs: string
    fidelity: ProjectionFidelity
    available: boolean
    outputHint: string
    disabledReason?: string
}

type SkillSource = {
    name: string
    dir: string
}

type StudioAgentPackage = {
    packageId: string
    name: string
    slug: string
    description: string
    instruction: string
    model: ModelSelection
    mcpServerNames: string[]
    skills: SkillSource[]
}

type ProjectionOwnershipManifest = {
    version: 1
    files: Record<string, {
        hash: string
        packageId: string
        target: ApmSyncTargetId
        updatedAt: string
    }>
}

type WriteContext = {
    workingDir: string
    packageId: string
    target: ApmSyncTargetId
    ownership: ProjectionOwnershipManifest
}

const OWNERSHIP_RELATIVE_PATH = '.apm-studio/projections/agent-projection.json'

const TARGET_PROFILES: AgentProjectionTargetProfile[] = [
    {
        id: 'codex',
        label: 'Codex',
        description: 'Project agent packages as Codex custom subagents. Model stays Studio-only.',
        projectedAs: 'Codex subagent',
        fidelity: 'subagent',
        available: true,
        outputHint: '.codex/agents/*.toml',
    },
    {
        id: 'claude',
        label: 'Claude',
        description: 'Project agent packages as Claude agents with adjacent skills. Model stays Studio-only.',
        projectedAs: 'Claude agent',
        fidelity: 'native-agent',
        available: true,
        outputHint: '.claude/agents/*.md',
    },
    {
        id: 'opencode',
        label: 'OpenCode',
        description: 'Project agent packages as OpenCode agents for external injection. Studio Run remains separate.',
        projectedAs: 'OpenCode agent',
        fidelity: 'native-agent',
        available: true,
        outputHint: '.opencode/agents/*.md',
    },
    {
        id: 'cursor',
        label: 'Cursor',
        description: 'Project agent packages as Cursor agents with shared agent skills. Model stays Studio-only.',
        projectedAs: 'Cursor agent',
        fidelity: 'native-agent',
        available: true,
        outputHint: '.cursor/agents/*.md',
    },
    {
        id: 'windsurf',
        label: 'Windsurf',
        description: 'Project agent packages through a Windsurf skill adapter. Model stays Studio-only.',
        projectedAs: 'Windsurf skill adapter',
        fidelity: 'skill-adapter',
        available: true,
        outputHint: '.windsurf/skills/*/SKILL.md',
    },
    {
        id: 'copilot',
        label: 'Copilot',
        description: 'Project agent packages as GitHub Copilot agent files. Model stays Studio-only.',
        projectedAs: 'Copilot agent',
        fidelity: 'native-agent',
        available: true,
        outputHint: '.github/agents/*.agent.md',
    },
    {
        id: 'gemini',
        label: 'Gemini',
        description: 'Gemini does not expose a native agent primitive in the current APM target shape.',
        projectedAs: 'Unsupported native agent',
        fidelity: 'unsupported',
        available: false,
        outputHint: 'Native agent projection unavailable',
        disabledReason: 'Gemini needs an explicit instruction-flattening policy before Studio can inject agents safely.',
    },
    {
        id: 'agent-skills',
        label: 'Agent Skills',
        description: 'Project skills to the shared .agents skills directory.',
        projectedAs: 'Agent skills',
        fidelity: 'native-agent',
        available: true,
        outputHint: '.agents/skills/*/SKILL.md',
    },
]

function targetProfile(target: ApmSyncTargetId) {
    const profile = TARGET_PROFILES.find((entry) => entry.id === target)
    if (!profile) {
        throw new Error(`Unsupported APM sync target: ${target}`)
    }
    return profile
}

export function listAgentProjectionTargets() {
    return TARGET_PROFILES
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

function hashContent(content: string) {
    return crypto.createHash('sha256').update(content).digest('hex')
}

function posixJoin(...segments: string[]) {
    return segments
        .flatMap((segment) => segment.split(/[\\/]+/g))
        .filter(Boolean)
        .join('/')
}

function tomlString(value: string) {
    return JSON.stringify(value)
}

function markdownFrontmatter(fields: Record<string, unknown>) {
    const yaml = yamlString(Object.fromEntries(
        Object.entries(fields).filter(([, value]) => {
            if (value === null || value === undefined) return false
            if (Array.isArray(value) && value.length === 0) return false
            return true
        }),
    )).trimEnd()
    return `---\n${yaml}\n---`
}

function parseMarkdownBody(raw: string) {
    const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    if (lines[0]?.trim() !== '---') {
        return normalized.trim()
    }
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end < 0) {
        return normalized.trim()
    }
    return lines.slice(end + 1).join('\n').trim()
}

function agentExtension(manifest: ApmPackageManifest) {
    return manifest['x-apm']?.agent || null
}

function agentInstructionFromManifest(manifest: ApmPackageManifest) {
    const agent = agentExtension(manifest)
    const body = agent?.agentBody ?? agent?.inlineInstruction
    if (typeof body === 'string' && body.trim()) {
        return body.trim()
    }

    const manifestAgent = Array.isArray(manifest.agents) ? manifest.agents[0] : null
    if (isRecord(manifestAgent)) {
        const instruction = manifestAgent.instruction
        if (typeof instruction === 'string' && instruction.trim()) {
            return instruction.trim()
        }
        if (isRecord(instruction) && typeof instruction.content === 'string' && instruction.content.trim()) {
            return instruction.content.trim()
        }
    }

    return null
}

async function firstMarkdownBody(dir: string, suffix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const file = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
        .map((entry) => path.join(dir, entry.name))
        .sort((left, right) => left.localeCompare(right))[0]
    if (!file) return null
    const body = parseMarkdownBody(await fs.readFile(file, 'utf-8'))
    return body || null
}

function mcpNamesFromDependencies(entries: ApmDependency[] | undefined) {
    return (entries || [])
        .map((entry) => typeof entry === 'string' ? entry : entry.name)
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

async function discoverSkills(sourceDir: string): Promise<SkillSource[]> {
    const skillsDir = path.join(sourceDir, 'skills')
    const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => [])
    const skills: SkillSource[] = []
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dir = path.join(skillsDir, entry.name)
        const skillFile = path.join(dir, 'SKILL.md')
        const stat = await fs.stat(skillFile).catch(() => null)
        if (!stat?.isFile()) continue
        skills.push({ name: entry.name, dir })
    }
    return skills.sort((left, right) => left.name.localeCompare(right.name))
}

async function loadStudioAgentPackage(
    workingDir: string,
    packageId: string,
): Promise<StudioAgentPackage | null> {
    const manifestPath = await manifestPathForRead(workingDir, packageId)
    const manifest = await readManifestFile(manifestPath)
    if (!manifest) return null

    const agent = agentExtension(manifest)
    if (!agent && manifest['x-apm']?.kind !== 'agent') {
        return null
    }

    const sourceDir = await sourceDirForRead(workingDir, packageId)
    const name = agent?.agentName || agent?.performerName || manifest.name || packageId
    const slug = slugifySegment(name || packageId)
    const description = agent?.description?.trim()
        || (typeof manifest.description === 'string' && manifest.description.trim() ? manifest.description.trim() : null)
        || `${name} agent package for APM Studio.`
    const instruction = agentInstructionFromManifest(manifest)
        || await firstMarkdownBody(path.join(sourceDir, 'agents'), '.agent.md')
        || await firstMarkdownBody(path.join(sourceDir, 'instructions'), '.instructions.md')
        || `You are ${name}.`

    return {
        packageId,
        name,
        slug,
        description,
        instruction,
        model: agent?.model || null,
        mcpServerNames: agent?.mcpServerNames || mcpNamesFromDependencies(manifest.dependencies?.mcp),
        skills: await discoverSkills(sourceDir),
    }
}

async function readOwnershipManifest(workingDir: string): Promise<ProjectionOwnershipManifest> {
    const filePath = path.join(workingDir, OWNERSHIP_RELATIVE_PATH)
    const raw = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (!raw) {
        return { version: 1, files: {} }
    }
    try {
        const parsed = JSON.parse(raw) as ProjectionOwnershipManifest
        return parsed.version === 1 && isRecord(parsed.files)
            ? parsed
            : { version: 1, files: {} }
    } catch {
        return { version: 1, files: {} }
    }
}

async function writeOwnershipManifest(workingDir: string, manifest: ProjectionOwnershipManifest) {
    const filePath = path.join(workingDir, OWNERSHIP_RELATIVE_PATH)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

async function writeManagedText(relativePath: string, content: string, context: WriteContext) {
    const normalizedRelativePath = toPosixPath(relativePath).replace(/^\/+/, '')
    const filePath = path.join(context.workingDir, normalizedRelativePath)
    const nextHash = hashContent(content)
    const currentContent = await fs.readFile(filePath, 'utf-8').catch(() => null)
    const currentHash = currentContent === null ? null : hashContent(currentContent)
    const previous = context.ownership.files[normalizedRelativePath]

    if (currentHash && currentHash !== nextHash && previous?.hash !== currentHash) {
        throw new Error(`Refusing to overwrite unmanaged target file: ${normalizedRelativePath}`)
    }

    if (currentHash !== nextHash) {
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, content, 'utf-8')
    }

    context.ownership.files[normalizedRelativePath] = {
        hash: nextHash,
        packageId: context.packageId,
        target: context.target,
        updatedAt: new Date().toISOString(),
    }
    return normalizedRelativePath
}

async function collectFiles(dir: string): Promise<string[]> {
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

async function projectSkills(
    agentPackage: StudioAgentPackage,
    skillRoot: string,
    context: WriteContext,
) {
    const artifacts: string[] = []
    for (const skill of agentPackage.skills) {
        const files = await collectFiles(skill.dir)
        for (const file of files) {
            const content = await fs.readFile(file, 'utf-8')
            const relativeToSkill = toPosixPath(path.relative(skill.dir, file))
            artifacts.push(await writeManagedText(
                posixJoin(skillRoot, skill.name, relativeToSkill),
                content,
                context,
            ))
        }
    }
    return artifacts
}

function codexAgentToml(agentPackage: StudioAgentPackage) {
    return [
        `name = ${tomlString(agentPackage.slug)}`,
        `description = ${tomlString(agentPackage.description)}`,
        `developer_instructions = ${tomlString(agentPackage.instruction)}`,
        '',
    ].join('\n')
}

function markdownAgent(agentPackage: StudioAgentPackage) {
    return `${markdownFrontmatter({
        name: agentPackage.slug,
        description: agentPackage.description,
    })}\n\n${agentPackage.instruction.trimEnd()}\n`
}

function windsurfSkill(agentPackage: StudioAgentPackage) {
    return `${markdownFrontmatter({
        name: agentPackage.slug,
        description: agentPackage.description,
    })}\n\n# ${agentPackage.name}\n\n${agentPackage.instruction.trimEnd()}\n`
}

async function projectAgentArtifact(
    profile: AgentProjectionTargetProfile,
    agentPackage: StudioAgentPackage,
    context: WriteContext,
) {
    switch (profile.id) {
        case 'codex':
            return writeManagedText(
                posixJoin('.codex', 'agents', `${agentPackage.slug}.toml`),
                codexAgentToml(agentPackage),
                context,
            )
        case 'claude':
            return writeManagedText(
                posixJoin('.claude', 'agents', `${agentPackage.slug}.md`),
                markdownAgent(agentPackage),
                context,
            )
        case 'opencode':
            return writeManagedText(
                posixJoin('.opencode', 'agents', `${agentPackage.slug}.md`),
                markdownAgent(agentPackage),
                context,
            )
        case 'cursor':
            return writeManagedText(
                posixJoin('.cursor', 'agents', `${agentPackage.slug}.md`),
                markdownAgent(agentPackage),
                context,
            )
        case 'copilot':
            return writeManagedText(
                posixJoin('.github', 'agents', `${agentPackage.slug}.agent.md`),
                markdownAgent(agentPackage),
                context,
            )
        case 'windsurf':
            return writeManagedText(
                posixJoin('.windsurf', 'skills', agentPackage.slug, 'SKILL.md'),
                windsurfSkill(agentPackage),
                context,
            )
        default:
            throw new Error(`Target ${profile.id} does not support native agent projection.`)
    }
}

function skillRootForTarget(target: ApmSyncTargetId) {
    switch (target) {
        case 'claude':
            return posixJoin('.claude', 'skills')
        case 'windsurf':
            return posixJoin('.windsurf', 'skills')
        default:
            return posixJoin('.agents', 'skills')
    }
}

export async function projectAgentPackageToTarget(
    workingDir: string,
    packageId: string,
    target: ApmSyncTargetId,
    exportUnit: ApmExportUnit = 'agent-packages',
): Promise<ApmSyncPackageResult> {
    const profile = targetProfile(target)
    const startedWarnings: string[] = []
    const includeAgent = exportUnit !== 'skills' && target !== 'agent-skills'
    const includeSkills = exportUnit !== 'agents'

    if (!profile.available) {
        return {
            packageId,
            name: packageId,
            target,
            exportUnit,
            command: `apm-studio inject ${packageId} --target ${target}`,
            status: 'skipped',
            projectedAs: profile.projectedAs,
            warnings: [profile.disabledReason || `${profile.label} projection is unavailable.`],
        }
    }

    const agentPackage = await loadStudioAgentPackage(workingDir, packageId)
    if (!agentPackage) {
        return {
            packageId,
            name: packageId,
            target,
            exportUnit,
            command: `apm-studio inject ${packageId} --target ${target}`,
            status: 'skipped',
            projectedAs: profile.projectedAs,
            warnings: ['Only agent packages can be injected into external assistant targets.'],
        }
    }

    if (agentPackage.model) {
        startedWarnings.push('Model selection is Studio Run-only and was omitted from target artifacts.')
    }
    if (agentPackage.mcpServerNames.length > 0) {
        startedWarnings.push('MCP server names are preserved in the package; target MCP config writing is deferred until Studio has concrete server configs.')
    }

    const ownership = await readOwnershipManifest(workingDir)
    const context: WriteContext = {
        workingDir,
        packageId,
        target,
        ownership,
    }
    const artifacts = [
        ...(includeAgent ? [await projectAgentArtifact(profile, agentPackage, context)] : []),
        ...(includeSkills ? await projectSkills(agentPackage, skillRootForTarget(target), context) : []),
    ]
    await writeOwnershipManifest(workingDir, ownership)

    return {
        packageId,
        name: agentPackage.name,
        target,
        exportUnit,
        command: `apm-studio inject ${packageId} --target ${target}`,
        status: artifacts.length > 0 ? 'synced' : 'skipped',
        projectedAs: profile.projectedAs,
        artifacts,
        warnings: artifacts.length > 0 ? startedWarnings : [...startedWarnings, 'No matching fallback artifacts were produced for this export unit.'],
        modelOmitted: agentPackage.model !== null,
        stdout: artifacts.join('\n'),
        stderr: startedWarnings.join('\n') || undefined,
    }
}
