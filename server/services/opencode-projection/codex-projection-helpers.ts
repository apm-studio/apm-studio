import fs from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { readGlobalMcpCatalog } from '../../lib/mcp-catalog.js'
import type { McpCatalog } from '../../../shared/mcp-catalog.js'
import {
    readManifest,
    toRelativePath,
    writeManifest,
    type ProjectionManifest,
} from './projection-manifest.js'
import type { CompiledSkill } from './dance-compiler.js'
import type {
    CodexProjectionPerformerSnapshot,
    PerformerProjectionInput,
} from './performer-projection-types.js'

function groupKey(performerId: string) {
    return `performer:${performerId}`
}

export function isCodexAgentProjectionPath(filePath: string) {
    return filePath.startsWith('.codex/agents/dot_studio_') && filePath.endsWith('.toml')
}

export function isCodexSkillLinkProjectionPath(filePath: string) {
    return filePath.startsWith('.agents/skills/dot-studio-')
}

export function isCodexImmediateProjectionPath(filePath: string) {
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

export function attachCodexSkillPaths(
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

export async function syncCodexSkillLinks(skills: CompiledSkill[]) {
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

export async function updateCodexProjectionManifestGroup(input: {
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

export async function resolveCodexMcpServers(mcpServerNames: string[]): Promise<McpCatalog | undefined> {
    const resolvedNames = Array.from(new Set(mcpServerNames.filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
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

export function performerSnapshotToCodexProjectionInput(
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
