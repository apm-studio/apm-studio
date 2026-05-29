import path from 'path'
import { localSkillProjectionDir, toRelativePath } from './projection-manifest.js'
import { readDraft } from '../drafts/service.js'
import {
    isSkillBundleDraft,
    skillBundleDir,
    readBundleSkillContent,
} from '../drafts/skill-bundle-service.js'
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
): Promise<CompiledSkill> {
    if (ref.kind === 'registry') {
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
        const logicalName = sanitizeSegment(draft?.name || ref.draftId)
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

        return {
            logicalName,
            description,
            filePath,
            relativePath: toRelativePath(executionDir, filePath),
            content,
            additionalFiles: bundleSync.projectedFiles.map((filePath) => toRelativePath(executionDir, filePath)),
            bundleChanged: bundleSync.changed,
        }
    }

    const draft = await readDraft(cwd, 'skill', ref.draftId)
    const body = draft ? (typeof draft.content === 'string' ? draft.content : null) : null
    if (!draft || !body) {
        throw new Error(`Skill draft '${ref.draftId}' was not found or has no content.`)
    }

    const logicalName = sanitizeSegment(draft.name || ref.draftId)
    const description = extractDraftDescription(draft) || draft.name || 'Draft skill'
    const filePath = path.join(
        localSkillProjectionDir(executionDir, workspaceHash, agentId, scope, teamId),
        logicalName,
        'SKILL.md',
    )
    const content = `${buildFrontmatter(logicalName, description)}\n\n${body}`

    return {
        logicalName,
        description,
        filePath,
        relativePath: toRelativePath(executionDir, filePath),
        content,
        additionalFiles: [],
        bundleChanged: false,
    }
}
