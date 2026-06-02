import type { WorkspaceMode } from './types'

export const WORKSPACE_MODE_STORAGE_KEY = 'apm-studio:workspace-mode'
export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = 'studio-agent'

export function isWorkspaceMode(value: unknown): value is WorkspaceMode {
    return value === 'import' || value === 'export' || value === 'studio-agent'
}

function browserLocalStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
}

export function readStoredWorkspaceMode(
    storage: Pick<Storage, 'getItem'> | null = browserLocalStorage(),
): WorkspaceMode {
    if (!storage) return DEFAULT_WORKSPACE_MODE
    try {
        const value = storage.getItem(WORKSPACE_MODE_STORAGE_KEY)
        return isWorkspaceMode(value) ? value : DEFAULT_WORKSPACE_MODE
    } catch {
        return DEFAULT_WORKSPACE_MODE
    }
}

export function writeStoredWorkspaceMode(
    mode: WorkspaceMode,
    storage: Pick<Storage, 'setItem'> | null = browserLocalStorage(),
) {
    if (!storage) return
    try {
        storage.setItem(WORKSPACE_MODE_STORAGE_KEY, mode)
    } catch {
        // Last mode is UI convenience only.
    }
}
