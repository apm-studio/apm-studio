import type { FileListEntry, FindFilesResponse } from '../../../shared/opencode-contracts'
import { fetchJSON, resolveWorkingDirContext } from '../../api-core'

type WorkspaceFileEntry = string | FileListEntry

function isAbsoluteWorkspacePath(path: string) {
    return path.startsWith('/')
        || path.startsWith('\\')
        || /^[a-zA-Z]:[\\/]/.test(path)
        || path.startsWith('file://')
}

function trimTrailingPathSeparators(path: string) {
    return path.replace(/[\\/]+$/, '')
}

function trimLeadingRelativePathPrefix(path: string) {
    return path.replace(/^\.?[\\/]+/, '')
}

function workspaceSeparator(workingDir: string) {
    return workingDir.includes('\\') && !workingDir.includes('/') ? '\\' : '/'
}

function basename(path: string) {
    return path.split(/[/\\]/).pop() || path
}

export function absolutizeWorkspacePath(path: string, workingDir: string | null) {
    if (!path) {
        return path
    }
    if (isAbsoluteWorkspacePath(path) || !workingDir) {
        return path
    }
    return `${trimTrailingPathSeparators(workingDir)}${workspaceSeparator(workingDir)}${trimLeadingRelativePathPrefix(path)}`
}

export function normalizeWorkspaceFileEntry(entry: WorkspaceFileEntry) {
    if (typeof entry === 'string') {
        return {
            name: basename(entry),
            path: entry,
            absolute: absolutizeWorkspacePath(entry, resolveWorkingDirContext()),
            type: 'file',
        }
    }
    const entryPath = entry.path || entry.absolute || ''
    return {
        name: entry.name || basename(entryPath),
        path: entryPath,
        absolute: absolutizeWorkspacePath(entry.absolute || entryPath, resolveWorkingDirContext()),
        type: entry.type || (entry.isDirectory ? 'directory' : 'file'),
    }
}

export const workspaceFilesApi = {
    findFiles: async (query: string) => {
        const normalized = query.trim()

        const response = await fetchJSON<FindFilesResponse>(`/api/find/files?pattern=${encodeURIComponent(normalized)}`)

        return response.files
            .map((entry) => normalizeWorkspaceFileEntry(entry))
            .filter((entry) => entry.type === 'file')
    },
}
