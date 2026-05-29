/**
 * server/services/drafts/skill-bundle-service.ts — CRUD operations for Skill folders.
 *
 * A Skill folder is a directory-backed draft that stores:
 *   .apm-studio/drafts/skill/<draftId>/
 *       ├── draft.json     (metadata)
 *       ├── SKILL.md       (main skill content)
 *       ├── scripts/       (helper scripts)
 *       ├── references/    (reference docs)
 *       └── assets/        (assets/media)
 *
 * This module handles bundle-specific file operations.
 * Generic draft CRUD (create/read/update/delete/list) lives in server/services/drafts/service.ts.
 */

import fs from 'fs/promises'
import path from 'path'
import { getApmStudioDir } from '../../lib/apm-studio-paths.js'
import type { BundleTreeEntry } from '../../../shared/draft-contracts.js'

// ── Path resolution ─────────────────────────────────────

const BUNDLE_SCAFFOLD_DIRS = ['scripts', 'references', 'assets'] as const

export function skillBundleDir(cwd: string, draftId: string): string {
    return path.join(getApmStudioDir(cwd), 'drafts', 'skill', draftId)
}

export async function isSkillBundleDraft(cwd: string, draftId: string): Promise<boolean> {
    const bundlePath = path.join(skillBundleDir(cwd, draftId), 'draft.json')
    try {
        await fs.access(bundlePath)
        return true
    } catch {
        return false
    }
}

// ── Path sanitization ───────────────────────────────────

/**
 * Ensures a relative path is safe and sandboxed within the bundle root.
 * Rejects absolute paths, `..` traversal, null bytes, and empty paths.
 */
export function sanitizeBundlePath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('File path is required.')
    }

    // Reject null bytes
    if (filePath.includes('\0')) {
        throw new Error('Invalid file path: contains null bytes.')
    }

    // Normalize and resolve
    const normalized = path.normalize(filePath)

    // Reject absolute paths
    if (path.isAbsolute(normalized)) {
        throw new Error('Absolute paths are not allowed.')
    }

    // Reject path traversal
    if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) {
        throw new Error('Path traversal is not allowed.')
    }

    // Reject paths that try to escape via leading slash after normalize
    if (normalized.startsWith(path.sep)) {
        throw new Error('Invalid path.')
    }

    return normalized
}

// ── Skill scaffold ─────────────────────────────────────

/**
 * Create the initial directory structure for a Skill folder.
 */
export async function scaffoldSkillBundle(
    cwd: string,
    draftId: string,
    skillContent: string,
): Promise<void> {
    const bundleRoot = skillBundleDir(cwd, draftId)
    await fs.mkdir(bundleRoot, { recursive: true })

    // Create scaffold directories
    for (const dir of BUNDLE_SCAFFOLD_DIRS) {
        await fs.mkdir(path.join(bundleRoot, dir), { recursive: true })
    }

    // Write SKILL.md
    await fs.writeFile(path.join(bundleRoot, 'SKILL.md'), skillContent, 'utf-8')
}

// ── Bundle tree ─────────────────────────────────────────

async function buildTree(dirPath: string, basePath: string): Promise<BundleTreeEntry[]> {
    const entries: BundleTreeEntry[] = []
    let dirEntries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>

    try {
        dirEntries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
        return entries
    }

    // Sort: directories first, then files, alphabetical within each group
    dirEntries.sort((a, b) => {
        const aIsDir = a.isDirectory() ? 0 : 1
        const bIsDir = b.isDirectory() ? 0 : 1
        if (aIsDir !== bIsDir) return aIsDir - bIsDir
        return a.name.localeCompare(b.name)
    })

    for (const entry of dirEntries) {
        // Skip draft.json from the tree view — it's internal metadata
        if (entry.name === 'draft.json' && basePath === '') continue

        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

        if (entry.isDirectory()) {
            const children = await buildTree(path.join(dirPath, entry.name), relativePath)
            entries.push({
                name: entry.name,
                type: 'directory',
                path: relativePath,
                children,
            })
        } else if (entry.isFile()) {
            entries.push({
                name: entry.name,
                type: 'file',
                path: relativePath,
            })
        }
    }

    return entries
}

export async function getSkillBundleTree(cwd: string, draftId: string): Promise<BundleTreeEntry[]> {
    const bundleRoot = skillBundleDir(cwd, draftId)
    return buildTree(bundleRoot, '')
}

// ── File read/write ─────────────────────────────────────

export async function readSkillBundleFile(
    cwd: string,
    draftId: string,
    filePath: string,
): Promise<string> {
    const safePath = sanitizeBundlePath(filePath)
    const fullPath = path.join(skillBundleDir(cwd, draftId), safePath)

    try {
        return await fs.readFile(fullPath, 'utf-8')
    } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`File not found: ${safePath}`)
        }
        throw error
    }
}

export async function writeSkillBundleFile(
    cwd: string,
    draftId: string,
    filePath: string,
    content: string,
): Promise<void> {
    const safePath = sanitizeBundlePath(filePath)
    const fullPath = path.join(skillBundleDir(cwd, draftId), safePath)

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
}

// ── File/directory creation ─────────────────────────────

export async function createSkillBundleFile(
    cwd: string,
    draftId: string,
    filePath: string,
    isDirectory = false,
): Promise<void> {
    const safePath = sanitizeBundlePath(filePath)
    const fullPath = path.join(skillBundleDir(cwd, draftId), safePath)

    if (isDirectory) {
        await fs.mkdir(fullPath, { recursive: true })
    } else {
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        // Only create if doesn't exist
        try {
            await fs.access(fullPath)
            throw new Error(`File already exists: ${safePath}`)
        } catch (error: unknown) {
            if (error instanceof Error && error.message.startsWith('File already exists')) throw error
            await fs.writeFile(fullPath, '', 'utf-8')
        }
    }
}

// ── File deletion ───────────────────────────────────────

export async function deleteSkillBundleFile(
    cwd: string,
    draftId: string,
    filePath: string,
): Promise<void> {
    const safePath = sanitizeBundlePath(filePath)

    // Protect critical files
    if (safePath === 'SKILL.md') {
        throw new Error('Cannot delete SKILL.md — it is the primary skill file.')
    }

    const fullPath = path.join(skillBundleDir(cwd, draftId), safePath)
    await fs.rm(fullPath, { recursive: true, force: true })
}

// ── Bundle content helpers ──────────────────────────────

/**
 * Read the SKILL.md content from a bundle draft.
 * Returns null if the file doesn't exist.
 */
export async function readBundleSkillContent(cwd: string, draftId: string): Promise<string | null> {
    try {
        return await fs.readFile(path.join(skillBundleDir(cwd, draftId), 'SKILL.md'), 'utf-8')
    } catch {
        return null
    }
}

/**
 * Write the SKILL.md content to a bundle draft.
 */
export async function writeBundleSkillContent(cwd: string, draftId: string, content: string): Promise<void> {
    await fs.writeFile(path.join(skillBundleDir(cwd, draftId), 'SKILL.md'), content, 'utf-8')
}

/**
 * Get all file paths in a bundle for projection purposes.
 * Returns absolute paths.
 */
export async function listBundleFilePaths(cwd: string, draftId: string): Promise<string[]> {
    const bundleRoot = skillBundleDir(cwd, draftId)
    const files: string[] = []

    async function walk(dir: string) {
        let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>
        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.name === 'draft.json') continue // skip metadata
            if (entry.isFile()) {
                files.push(fullPath)
            } else if (entry.isDirectory()) {
                await walk(fullPath)
            }
        }
    }

    await walk(bundleRoot)
    return files
}
