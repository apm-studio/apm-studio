import { describe, expect, it } from 'vitest'
import {
    DEFAULT_WORKSPACE_MODE,
    readStoredWorkspaceMode,
    WORKSPACE_MODE_STORAGE_KEY,
    writeStoredWorkspaceMode,
} from './workspace-mode-storage'

describe('workspace mode storage', () => {
    it('falls back to Studio Agent when storage is missing or invalid', () => {
        expect(readStoredWorkspaceMode(null)).toBe(DEFAULT_WORKSPACE_MODE)
        expect(readStoredWorkspaceMode({ getItem: () => 'settings' })).toBe(DEFAULT_WORKSPACE_MODE)
    })

    it('reads valid stored workspace modes', () => {
        expect(readStoredWorkspaceMode({ getItem: () => 'import' })).toBe('import')
        expect(readStoredWorkspaceMode({ getItem: () => 'export' })).toBe('export')
        expect(readStoredWorkspaceMode({ getItem: () => 'studio-agent' })).toBe('studio-agent')
    })

    it('writes the selected mode without touching workspace state storage', () => {
        const writes = new Map<string, string>()
        writeStoredWorkspaceMode('export', {
            setItem: (key, value) => writes.set(key, value),
        })

        expect(writes.get(WORKSPACE_MODE_STORAGE_KEY)).toBe('export')
    })
})
