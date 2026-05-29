/**
 * server/services/drafts/service.ts — Filesystem CRUD for `.apm-studio/drafts/`
 *
 * Instruction / Agent / Team: .apm-studio/drafts/<kind>/<id>.json
 * Skill bundle:              .apm-studio/drafts/skill/<id>/draft.json + SKILL.md + sibling dirs
 * Project-local only — no global scope.
 */

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { ensureApmStudioDir, getApmStudioDir } from '../../lib/apm-studio-paths.js'
import {
    skillBundleDir,
    isSkillBundleDraft,
    scaffoldSkillBundle,
    readBundleSkillContent,
    writeBundleSkillContent,
} from './skill-bundle-service.js'
import type {
    CreateDraftRequest,
    DraftContent,
    DraftContentMap,
    DraftKind,
    DraftFile,
    UpdateDraftRequest,
    DraftDeleteResponse,
    DraftDeletePreviewResponse,
} from '../../../shared/draft-contracts.js'
import {
    buildDraftDeletePreview,
    sortDraftDependentsForDeletion,
} from './draft-dependency-planner.js'
import {
    DRAFT_KINDS,
    isRecord,
    normalizeDraftFile,
    normalizeRequestDraftContent,
} from './draft-normalizers.js'

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
}

function draftsDir(cwd: string): string {
    return path.join(getApmStudioDir(cwd), 'drafts')
}

function kindDir(cwd: string, kind: DraftKind): string {
    return path.join(draftsDir(cwd), kind)
}

function draftFilePath(cwd: string, kind: DraftKind, id: string): string {
    return path.join(kindDir(cwd, kind), `${id}.json`)
}

function generateDraftId(): string {
    const timestamp = Date.now().toString(36)
    const random = crypto.randomBytes(4).toString('hex')
    return `draft-${timestamp}-${random}`
}

async function ensureDraftsDir(cwd: string, kind: DraftKind): Promise<void> {
    await ensureApmStudioDir(cwd)
    await fs.mkdir(kindDir(cwd, kind), { recursive: true })
}

// ── Create ──────────────────────────────────────────────

export async function createDraft(cwd: string, input: CreateDraftRequest): Promise<DraftFile> {
    const id = input.id || generateDraftId()
    const now = Date.now()
    const content = normalizeRequestDraftContent(input.kind, input.content)

    // Skill drafts use bundle format
    if (input.kind === 'skill') {
        const skillContent = content as DraftContentMap['skill']
        const draft: DraftFile = {
            id,
            kind: input.kind,
            name: input.name,
            content: skillContent,
            slug: input.slug,
            description: input.description,
            tags: input.tags || [],
            derivedFrom: input.derivedFrom || null,
            createdAt: now,
            updatedAt: now,
            formatVersion: 2,
        }

        await ensureDraftsDir(cwd, input.kind)
        await scaffoldSkillBundle(cwd, id, skillContent)

        // Write draft.json metadata (content is stored in SKILL.md, not in draft.json)
        const metaOnly = { ...draft, content: undefined }
        await fs.writeFile(
            path.join(skillBundleDir(cwd, id), 'draft.json'),
            JSON.stringify(metaOnly, null, 2),
            'utf-8',
        )

        return draft
    }

    // Instruction / Agent / Team use JSON draft files.
    const draft: DraftFile = {
        id,
        kind: input.kind,
        name: input.name,
        content,
        slug: input.slug,
        description: input.description,
        tags: input.tags || [],
        derivedFrom: input.derivedFrom || null,
        createdAt: now,
        updatedAt: now,
        formatVersion: 1,
    }

    await ensureDraftsDir(cwd, input.kind)
    await fs.writeFile(
        draftFilePath(cwd, input.kind, id),
        JSON.stringify(draft, null, 2),
        'utf-8',
    )

    return draft
}

// ── Read ────────────────────────────────────────────────

export async function readDraft(cwd: string, kind: DraftKind, id: string): Promise<DraftFile | null> {
    if (kind === 'skill') {
        if (await isSkillBundleDraft(cwd, id)) {
            return readSkillBundleDraft(cwd, id)
        }
        return null
    }

    return readJsonDraft(cwd, kind, id)
}

async function readJsonDraft(cwd: string, kind: DraftKind, id: string): Promise<DraftFile | null> {
    try {
        const raw = await fs.readFile(draftFilePath(cwd, kind, id), 'utf-8')
        return normalizeDraftFile(JSON.parse(raw) as unknown, kind)
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') return null
        throw error
    }
}

async function readSkillBundleDraft(cwd: string, id: string): Promise<DraftFile | null> {
    try {
        const metaRaw = await fs.readFile(path.join(skillBundleDir(cwd, id), 'draft.json'), 'utf-8')
        const meta = JSON.parse(metaRaw) as unknown
        const skillContent = await readBundleSkillContent(cwd, id)
        return normalizeDraftFile({
            ...(isRecord(meta) ? meta : {}),
            content: skillContent || '',
            formatVersion: 2,
        }, 'skill')
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') return null
        throw error
    }
}

/**
 * Read just the content field from a draft — used by compilers.
 * Returns the text content for instruction/skill, or the full content object for agent/team.
 */
export async function readDraftContent(cwd: string, kind: DraftKind, id: string): Promise<DraftContent | null> {
    const draft = await readDraft(cwd, kind, id)
    if (!draft) return null
    return draft.content
}

/**
 * Read the text content from a draft — convenience for instruction/skill.
 * Returns null if not found or content is not a string.
 */
export async function readDraftTextContent(cwd: string, kind: DraftKind, id: string): Promise<string | null> {
    const content = await readDraftContent(cwd, kind, id)
    return typeof content === 'string' ? content : null
}

// ── List ────────────────────────────────────────────────

export async function listDrafts(cwd: string, kind?: DraftKind): Promise<DraftFile[]> {
    const kinds = kind ? [kind] : [...DRAFT_KINDS]
    const drafts: DraftFile[] = []
    const seenIds = new Set<string>()

    for (const k of kinds) {
        const dir = kindDir(cwd, k)
        let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>

        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch (error: unknown) {
            if (isErrnoException(error) && error.code === 'ENOENT') continue
            throw error
        }

        for (const entry of entries) {
            // Skill draft directories
            if (k === 'skill' && entry.isDirectory()) {
                try {
                    const metaPath = path.join(dir, entry.name, 'draft.json')
                    const raw = await fs.readFile(metaPath, 'utf-8')
                    const meta = JSON.parse(raw) as unknown
                    const skillContent = await readBundleSkillContent(cwd, entry.name)
                    const draft = normalizeDraftFile({
                        ...(isRecord(meta) ? meta : {}),
                        content: skillContent || '',
                        formatVersion: 2,
                    }, 'skill')
                    drafts.push(draft)
                    seenIds.add(draft.id)
                } catch {
                    // Skip malformed Skill draft directory
                }
                continue
            }

            // JSON draft files
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue

            try {
                const raw = await fs.readFile(path.join(dir, entry.name), 'utf-8')
                const draft = normalizeDraftFile(JSON.parse(raw) as unknown, k)
                // Skip if already seen as a directory-backed Skill draft (shouldn't happen, but safety)
                if (seenIds.has(draft.id)) continue
                drafts.push(draft)
            } catch {
                // Skip malformed files
            }
        }
    }

    return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
}

// ── Update ──────────────────────────────────────────────

export async function updateDraft(
    cwd: string,
    kind: DraftKind,
    id: string,
    patch: UpdateDraftRequest,
): Promise<DraftFile | null> {
    const existing = await readDraft(cwd, kind, id)
    if (!existing) return null
    const content = patch.content !== undefined
        ? normalizeRequestDraftContent(kind, patch.content)
        : undefined

    const updated: DraftFile = {
        ...existing,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.derivedFrom !== undefined ? { derivedFrom: patch.derivedFrom } : {}),
        updatedAt: Date.now(),
    }

    // Skill folder: write SKILL.md content + metadata to draft.json
    if (kind === 'skill' && (existing.formatVersion === 2 || await isSkillBundleDraft(cwd, id))) {
        updated.formatVersion = 2
        // Write SKILL.md if content was patched
        if (content !== undefined) {
            await writeBundleSkillContent(cwd, id, content as DraftContentMap['skill'])
        }
        // Write metadata to draft.json (content excluded from metadata file)
        const metaOnly = { ...updated, content: undefined }
        await fs.writeFile(
            path.join(skillBundleDir(cwd, id), 'draft.json'),
            JSON.stringify(metaOnly, null, 2),
            'utf-8',
        )
        return updated
    }

    // JSON draft file
    await fs.writeFile(
        draftFilePath(cwd, kind, id),
        JSON.stringify(updated, null, 2),
        'utf-8',
    )

    return updated
}

// ── Delete & Cascade ────────────────────────────────────

export async function findDraftDependents(
    cwd: string,
    targetKind: DraftKind,
    targetId: string,
): Promise<DraftDeletePreviewResponse> {
    const allDrafts = await listDrafts(cwd)
    return buildDraftDeletePreview(allDrafts, targetKind, targetId)
}

async function deleteSingleDraft(cwd: string, kind: DraftKind, id: string): Promise<boolean> {
    if (kind === 'skill' && await isSkillBundleDraft(cwd, id)) {
        await fs.rm(skillBundleDir(cwd, id), { recursive: true, force: true })
        return true
    }

    // JSON draft file
    try {
        await fs.unlink(draftFilePath(cwd, kind, id))
        return true
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') return false
        throw error
    }
}

export async function deleteDraft(cwd: string, kind: DraftKind, id: string, cascade = false): Promise<DraftDeleteResponse | null> {
    const deletedIds: string[] = []

    if (cascade) {
        const plan = await findDraftDependents(cwd, kind, id)
        const sortedDependents = sortDraftDependentsForDeletion(plan.dependents)

        for (const dep of sortedDependents) {
            try {
                const deleted = await deleteSingleDraft(cwd, dep.kind, dep.draftId)
                if (deleted) deletedIds.push(dep.draftId)
            } catch (error: unknown) {
                if (!isErrnoException(error) || error.code !== 'ENOENT') throw error
            }
        }
    }

    const deleted = await deleteSingleDraft(cwd, kind, id)
    if (deleted) {
        deletedIds.push(id)
        return { ok: true, deletedIds }
    }
    return null
}
