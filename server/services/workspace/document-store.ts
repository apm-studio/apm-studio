import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import type {
    SavedWorkspaceDocument,
    SavedWorkspaceSnapshot,
    SavedWorkspaceSummary,
} from '../../../shared/workspace-contracts.js'
import { workspacesDir, workspaceDir } from '../../lib/config.js'

function isAllowedWorkspaceCharacter(char: string) {
    const code = char.charCodeAt(0)
    return !('/\\:*?"<>|'.includes(char) || code < 32)
}

function sanitizeWorkspaceId(id: string): string {
    return id
        .replace(/\.\./g, '')
        .split('')
        .filter((char) => isAllowedWorkspaceCharacter(char))
        .join('')
        .trim()
}

export function validateWorkspaceId(id: string): string | null {
    const clean = sanitizeWorkspaceId(id)
    if (!clean || clean.length === 0) return null
    if (clean.length > 128) return null
    return clean
}

export function normalizeWorkingDir(input: string): string | null {
    const trimmed = input.trim().replace(/\/+$/, '')
    if (!trimmed) return null
    return path.resolve(trimmed)
}

export function workspaceIdForWorkingDir(workingDir: string): string {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 16)
}

export function workspacePathForId(id: string): string {
    return path.join(workspaceDir(id), 'workspace.json')
}

export function isWorkspacePathSafe(id: string): boolean {
    return workspacePathForId(id).startsWith(workspacesDir())
}

export function parseSavedWorkspaceDocument(value: unknown): SavedWorkspaceDocument | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const parsed = value as Partial<SavedWorkspaceDocument>
    if (
        parsed.schemaVersion !== 1
        || parsed.product !== 'APM Studio'
        || typeof parsed.workingDir !== 'string'
        || !parsed.workingDir.trim()
        || !parsed.workspace
        || typeof parsed.workspace !== 'object'
    ) {
        return null
    }
    return {
        schemaVersion: 1,
        product: 'APM Studio',
        workingDir: parsed.workingDir,
        ...(parsed.hiddenFromList === true ? { hiddenFromList: true } : {}),
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
        workspace: parsed.workspace as SavedWorkspaceSnapshot,
    }
}

export function workspaceFromSavedDocument(document: SavedWorkspaceDocument): SavedWorkspaceSnapshot {
    return {
        ...document.workspace,
        workingDir: document.workingDir,
        hiddenFromList: document.hiddenFromList ?? document.workspace.hiddenFromList,
    }
}

export function buildSavedWorkspaceDocument(workspace: SavedWorkspaceSnapshot): SavedWorkspaceDocument {
    const workingDir = normalizeWorkingDir(workspace.workingDir || '') || ''
    return {
        schemaVersion: 1,
        product: 'APM Studio',
        workingDir,
        ...(workspace.hiddenFromList === true ? { hiddenFromList: true } : {}),
        savedAt: Date.now(),
        workspace: {
            ...workspace,
            workingDir,
        },
    }
}

export async function readSavedWorkspaceDocumentForId(id: string): Promise<SavedWorkspaceDocument | null> {
    try {
        const raw = await fs.readFile(workspacePathForId(id), 'utf-8')
        return parseSavedWorkspaceDocument(JSON.parse(raw))
    } catch {
        return null
    }
}

export async function readSavedWorkspaceSnapshotForDir(workingDir: string): Promise<SavedWorkspaceSnapshot | null> {
    const document = await readSavedWorkspaceDocumentForId(workspaceIdForWorkingDir(workingDir))
    return document ? workspaceFromSavedDocument(document) : null
}

export async function writeSavedWorkspaceDocument(id: string, workspace: SavedWorkspaceSnapshot): Promise<{ updatedAt: number }> {
    const wsDir = workspaceDir(id)
    await fs.mkdir(wsDir, { recursive: true })

    const filePath = workspacePathForId(id)
    await fs.writeFile(filePath, JSON.stringify(buildSavedWorkspaceDocument(workspace), null, 2), 'utf-8')
    const stat = await fs.stat(filePath)
    return { updatedAt: stat.mtimeMs }
}

export async function writeSavedWorkspaceDocumentForId(id: string, document: SavedWorkspaceDocument): Promise<void> {
    await fs.writeFile(workspacePathForId(id), JSON.stringify(document, null, 2), 'utf-8')
}

export async function listSavedWorkspaceSummaries(includeHidden = false): Promise<SavedWorkspaceSummary[]> {
    const dir = workspacesDir()
    await fs.mkdir(dir, { recursive: true })
    const entries: SavedWorkspaceSummary[] = []

    let items: string[]
    try {
        items = await fs.readdir(dir)
    } catch {
        return []
    }

    await Promise.all(
        items.map(async (item) => {
            const itemDir = path.join(dir, item)
            try {
                const itemStat = await fs.stat(itemDir)
                if (!itemStat.isDirectory()) return

                const filePath = path.join(itemDir, 'workspace.json')
                const document = parseSavedWorkspaceDocument(JSON.parse(await fs.readFile(filePath, 'utf-8')))
                if (!document) return
                const workingDir = normalizeWorkingDir(document.workingDir) || ''
                if (!workingDir) return

                if (!includeHidden && document.hiddenFromList === true) return

                const stat = await fs.stat(filePath)
                entries.push({
                    id: item,
                    workingDir,
                    updatedAt: stat.mtimeMs,
                })
            } catch {
                // Skip invalid saved workspace entries.
            }
        }),
    )

    return entries.sort((a, b) => b.updatedAt - a.updatedAt)
}
