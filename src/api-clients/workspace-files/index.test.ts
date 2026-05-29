import { afterEach, describe, expect, it, vi } from 'vitest'
import { setApiWorkingDirContext } from '../../api-core'
import { absolutizeWorkspacePath, normalizeWorkspaceFileEntry, workspaceFilesApi } from './index'

describe('workspaceFilesApi', () => {
    afterEach(() => {
        setApiWorkingDirContext(null)
        vi.unstubAllGlobals()
    })

    it('reads file search results from the shared FindFilesResponse body', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ files: ['src/App.tsx'] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ))
        vi.stubGlobal('fetch', fetchMock)
        setApiWorkingDirContext('/tmp/workspace')

        await expect(workspaceFilesApi.findFiles('App')).resolves.toEqual([{
            name: 'App.tsx',
            path: 'src/App.tsx',
            absolute: '/tmp/workspace/src/App.tsx',
            type: 'file',
        }])

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/find/files?pattern=App&workingDir=%2Ftmp%2Fworkspace',
            expect.any(Object),
        )
    })

    it('preserves Windows absolute paths', () => {
        expect(absolutizeWorkspacePath('C:\\Users\\juno\\project\\file.ts', 'C:\\Users\\juno\\project')).toBe('C:\\Users\\juno\\project\\file.ts')
    })

    it('joins relative paths with Windows workspace separators', () => {
        expect(absolutizeWorkspacePath('src\\file.ts', 'C:\\Users\\juno\\project\\')).toBe('C:\\Users\\juno\\project\\src\\file.ts')
    })

    it('normalizes file entries in the workspace file API boundary', () => {
        setApiWorkingDirContext('C:\\Users\\juno\\project')

        expect(normalizeWorkspaceFileEntry('src\\file.ts')).toMatchObject({
            name: 'file.ts',
            absolute: 'C:\\Users\\juno\\project\\src\\file.ts',
        })
        expect(normalizeWorkspaceFileEntry({ path: 'src', isDirectory: true })).toMatchObject({
            name: 'src',
            path: 'src',
            type: 'directory',
        })
    })
})
