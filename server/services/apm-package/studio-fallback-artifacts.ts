import fs from 'fs/promises'
import path from 'path'
import type {
    ApmSyncTargetId,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts.js'
import {
    type ManagedSyncWriteContext,
    writeManagedSyncFile,
} from './sync-ownership.js'
import { syncTargetProfile } from './sync-targets.js'
import type { StudioFallbackSyncPackage } from './studio-fallback-package.js'
import { toPosixPath } from './paths.js'
import { yamlString } from './yaml-io.js'

export type StudioFallbackProjectionParts = {
    includeAgent: boolean
    includeSkills: boolean
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

async function writeManagedText(relativePath: string, content: string, context: ManagedSyncWriteContext) {
    return writeManagedSyncFile(relativePath, Buffer.from(content, 'utf-8'), context)
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
    syncPackage: StudioFallbackSyncPackage,
    skillRoot: string,
    context: ManagedSyncWriteContext,
) {
    const artifacts: string[] = []
    for (const skill of syncPackage.skills) {
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

function codexAgentToml(syncPackage: StudioFallbackSyncPackage) {
    return [
        `name = ${tomlString(syncPackage.slug)}`,
        `description = ${tomlString(syncPackage.description)}`,
        `developer_instructions = ${tomlString(syncPackage.instruction)}`,
        '',
    ].join('\n')
}

function markdownAgent(syncPackage: StudioFallbackSyncPackage) {
    return `${markdownFrontmatter({
        name: syncPackage.slug,
        description: syncPackage.description,
    })}\n\n${syncPackage.instruction.trimEnd()}\n`
}

async function projectAgentArtifact(
    target: ApmSyncTargetId,
    syncPackage: StudioFallbackSyncPackage,
    context: ManagedSyncWriteContext,
) {
    switch (target) {
        case 'codex':
            return writeManagedText(
                posixJoin('.codex', 'agents', `${syncPackage.slug}.toml`),
                codexAgentToml(syncPackage),
                context,
            )
        case 'claude':
            return writeManagedText(
                posixJoin('.claude', 'agents', `${syncPackage.slug}.md`),
                markdownAgent(syncPackage),
                context,
            )
        case 'opencode':
            return writeManagedText(
                posixJoin('.opencode', 'agents', `${syncPackage.slug}.md`),
                markdownAgent(syncPackage),
                context,
            )
        case 'cursor':
            return writeManagedText(
                posixJoin('.cursor', 'agents', `${syncPackage.slug}.md`),
                markdownAgent(syncPackage),
                context,
            )
        case 'copilot':
            return writeManagedText(
                posixJoin('.github', 'agents', `${syncPackage.slug}.agent.md`),
                markdownAgent(syncPackage),
                context,
            )
        default:
            throw new Error(`Target ${target} does not support Studio fallback agent projection.`)
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

export function fallbackProjectionLabel(target: ApmSyncTargetId, syncUnit: ApmSyncUnit) {
    const profile = syncTargetProfile(target)
    if (target === 'agent-skills') {
        return 'Agent skills'
    }
    if (syncUnit === 'skills') {
        return `${profile.label} skills`
    }
    if (target === 'codex') {
        return 'Codex subagent'
    }
    return `${profile.label} agent`
}

export async function projectStudioFallbackArtifacts(input: {
    target: ApmSyncTargetId
    syncPackage: StudioFallbackSyncPackage
    parts: StudioFallbackProjectionParts
    context: ManagedSyncWriteContext
}) {
    const artifacts: string[] = []
    if (input.parts.includeAgent) {
        artifacts.push(await projectAgentArtifact(
            input.target,
            input.syncPackage,
            input.context,
        ))
    }
    if (input.parts.includeSkills) {
        artifacts.push(...await projectSkills(
            input.syncPackage,
            skillRootForTarget(input.target),
            input.context,
        ))
    }
    return artifacts
}
