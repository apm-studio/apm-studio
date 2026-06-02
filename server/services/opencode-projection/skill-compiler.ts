import fs from 'fs/promises'
import path from 'path'
import { localSkillProjectionDir, toRelativePath } from './projection-manifest.js'
import { getApmUserScopeCwd } from '../../lib/apm-studio-paths.js'
import { readDraft } from '../drafts/service.js'
import {
    isSkillBundleDraft,
    skillBundleDir,
    readBundleSkillContent,
} from '../drafts/skill-bundle-service.js'
import { sourceDir } from '../apm-package/paths.js'
import { parseYamlRecord } from '../apm-package/yaml-io.js'
import { syncSkillBundleSiblings } from './skill-bundle-sync.js'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'



export interface CompiledSkill {
    logicalName: string
    description: string
    filePath: string
    relativePath: string
    content: string
    /** Additional files projected from bundle (relative paths) */
    additionalFiles: string[]
    bundleChanged: boolean
}

function sanitizeSegment(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
}

function uniqueSegment(value: string, usedNames: Set<string>) {
    const base = sanitizeSegment(value) || 'skill'
    let candidate = base
    let index = 2
    while (usedNames.has(candidate)) {
        candidate = `${base}-${index}`
        index += 1
    }
    usedNames.add(candidate)
    return candidate
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

function extractSkillFrontmatter(content: string): Record<string, unknown> {
    const match = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    if (!match) {
        return {}
    }
    try {
        return parseYamlRecord(match[1], 'Skill frontmatter')
    } catch {
        return {}
    }
}

function frontmatterStringValue(frontmatter: Record<string, unknown>, key: string) {
    const value = frontmatter[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function extractDraftDescription(draft: { description?: string } | undefined | null): string {
    if (!draft) {
        return ''
    }
    if (typeof draft.description === 'string') {
        return draft.description
    }
    return ''
}

function buildFrontmatter(name: string, description: string) {
    return [
        '---',
        `name: ${JSON.stringify(name)}`,
        `description: ${JSON.stringify(description || 'Generated skill')}`,
        '---',
    ].join('\n')
}

export async function compileSkill(
    cwd: string,
    ref: SharedPrimitiveRef,
    workspaceHash: string,
    agentId: string,
    executionDir: string,
    scope: 'workspace' | 'team' = 'workspace',
    teamId?: string,
    usedNames = new Set<string>(),
): Promise<CompiledSkill[]> {
    if (ref.kind === 'registry') {
        const packageRef = parseApmPackageRef(ref)
        if (packageRef) {
            return compilePackageSkills(
                cwd,
                packageRef,
                workspaceHash,
                agentId,
                executionDir,
                scope,
                teamId,
                usedNames,
            )
        }
        throw new Error(`Registry skill references are no longer supported: ${ref.urn}. Import the source as an APM package primitive instead.`)
    }

    // ── Draft ref: check if bundle-backed ─────────────────
    const isBundle = await isSkillBundleDraft(cwd, ref.draftId)

    if (isBundle) {
        const body = await readBundleSkillContent(cwd, ref.draftId)
        if (!body) {
            throw new Error(`Skill draft '${ref.draftId}' is missing SKILL.md.`)
        }

        const draft = await readDraft(cwd, 'skill', ref.draftId)
        const logicalName = uniqueSegment(draft?.name || ref.draftId, usedNames)
        const description = extractDraftDescription(draft) || draft?.name || 'Draft skill'
        const skillDir = path.join(
            localSkillProjectionDir(executionDir, workspaceHash, agentId, scope, teamId),
            logicalName,
        )
        const filePath = path.join(skillDir, 'SKILL.md')
        const content = `${buildFrontmatter(logicalName, description)}\n\n${body}`

        // Copy bundle sibling directories into projection
        const bundleRoot = skillBundleDir(cwd, ref.draftId)
        const bundleSync = await syncSkillBundleSiblings(bundleRoot, skillDir)

        return [{
            logicalName,
            description,
            filePath,
            relativePath: toRelativePath(executionDir, filePath),
            content,
            additionalFiles: bundleSync.projectedFiles.map((filePath) => toRelativePath(executionDir, filePath)),
            bundleChanged: bundleSync.changed,
        }]
    }

    const draft = await readDraft(cwd, 'skill', ref.draftId)
    const body = draft ? (typeof draft.content === 'string' ? draft.content : null) : null
    if (!draft || !body) {
        throw new Error(`Skill draft '${ref.draftId}' was not found or has no content.`)
    }

    const logicalName = uniqueSegment(draft.name || ref.draftId, usedNames)
    const description = extractDraftDescription(draft) || draft.name || 'Draft skill'
    const filePath = path.join(
        localSkillProjectionDir(executionDir, workspaceHash, agentId, scope, teamId),
        logicalName,
        'SKILL.md',
    )
    const content = `${buildFrontmatter(logicalName, description)}\n\n${body}`

    return [{
        logicalName,
        description,
        filePath,
        relativePath: toRelativePath(executionDir, filePath),
        content,
        additionalFiles: [],
        bundleChanged: false,
    }]
}

async function compilePackageSkills(
    cwd: string,
    ref: ApmPackageRef,
    workspaceHash: string,
    agentId: string,
    executionDir: string,
    scope: 'workspace' | 'team',
    teamId: string | undefined,
    usedNames: Set<string>,
): Promise<CompiledSkill[]> {
    const packageSkillsDir = path.join(sourceDir(packageRefWorkingDir(cwd, ref), ref.packageId), 'skills')
    const entries = await fs.readdir(packageSkillsDir, { withFileTypes: true }).catch(() => [])
    const skillDirs = entries
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))

    if (skillDirs.length === 0) {
        throw new Error(`APM package '${ref.packageId}' has no skill primitives.`)
    }

    const projectionRoot = localSkillProjectionDir(executionDir, workspaceHash, agentId, scope, teamId)
    const compiled: CompiledSkill[] = []
    for (const entry of skillDirs) {
        const sourceSkillDir = path.join(packageSkillsDir, entry.name)
        const sourceSkillFile = path.join(sourceSkillDir, 'SKILL.md')
        const content = await fs.readFile(sourceSkillFile, 'utf-8')
        const frontmatter = extractSkillFrontmatter(content)
        const frontmatterName = frontmatterStringValue(frontmatter, 'name')
        const logicalName = uniqueSegment(frontmatterName || entry.name, usedNames)
        const description = frontmatterStringValue(frontmatter, 'description') || logicalName
        const skillDir = path.join(projectionRoot, logicalName)
        const filePath = path.join(skillDir, 'SKILL.md')
        const bundleSync = await syncSkillBundleSiblings(sourceSkillDir, skillDir)

        compiled.push({
            logicalName,
            description,
            filePath,
            relativePath: toRelativePath(executionDir, filePath),
            content,
            additionalFiles: bundleSync.projectedFiles.map((filePath) => toRelativePath(executionDir, filePath)),
            bundleChanged: bundleSync.changed,
        })
    }

    return compiled
}
