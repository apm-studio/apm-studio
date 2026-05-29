import fs from 'fs/promises'
import path from 'path'
import type {
    ApmDependency,
    ApmPackageManifest,
} from '../../../shared/apm-contracts.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import { readManifestFile } from './package-files.js'
import {
    manifestPath as packageManifestPath,
    sourceDir as packageSourceDir,
} from './paths.js'
import { isRecord } from './yaml-io.js'

export type StudioFallbackSkillSource = {
    name: string
    dir: string
}

export type StudioFallbackSyncPackage = {
    hasAgent: boolean
    packageId: string
    name: string
    slug: string
    description: string
    instruction: string
    model: ModelSelection
    mcpServerNames: string[]
    skills: StudioFallbackSkillSource[]
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
    const body = agent?.agentBody
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

async function discoverSkills(sourceDir: string): Promise<StudioFallbackSkillSource[]> {
    const skillsDir = path.join(sourceDir, 'skills')
    const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => [])
    const skills: StudioFallbackSkillSource[] = []
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

function manifestHasAgent(manifest: ApmPackageManifest) {
    return !!manifest['x-apm']?.agent
        || manifest['x-apm']?.kind === 'agent'
        || (Array.isArray(manifest.agents) && manifest.agents.length > 0)
}

export async function loadStudioFallbackSyncPackage(
    workingDir: string,
    packageId: string,
): Promise<StudioFallbackSyncPackage | null> {
    const manifestPath = packageManifestPath(workingDir, packageId)
    const manifest = await readManifestFile(manifestPath)
    if (!manifest) return null

    const agent = agentExtension(manifest)
    const sourceDir = packageSourceDir(workingDir, packageId)
    const name = agent?.agentName || manifest.name || packageId
    const slug = slugifySegment(name || packageId)
    const description = agent?.description?.trim()
        || (typeof manifest.description === 'string' && manifest.description.trim() ? manifest.description.trim() : null)
        || `${name} agent package for APM Studio.`
    const instruction = agentInstructionFromManifest(manifest)
        || await firstMarkdownBody(path.join(sourceDir, 'agents'), '.agent.md')
        || await firstMarkdownBody(path.join(sourceDir, 'instructions'), '.instructions.md')
        || `You are ${name}.`

    return {
        hasAgent: manifestHasAgent(manifest),
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
