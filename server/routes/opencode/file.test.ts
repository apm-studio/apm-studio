import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
    FileListResponse,
    FileStatusResponse,
    FindFilesResponse,
    FindSymbolsResponse,
    FindTextResponse,
} from '../../../shared/opencode-contracts.js'

const opencodeServiceMock = vi.hoisted(() => ({
    findFilesInProject: vi.fn(),
    findSymbolsInProject: vi.fn(),
    findTextInProject: vi.fn(),
    getFileStatus: vi.fn(),
    listFiles: vi.fn(),
    readFile: vi.fn(),
}))

vi.mock('../../services/opencode/service.js', () => opencodeServiceMock)

describe('opencode file routes', () => {
    beforeEach(() => {
        Object.values(opencodeServiceMock).forEach((mock) => mock.mockReset())
    })

    it('wraps file browser entries in the shared list response contract', async () => {
        opencodeServiceMock.listFiles.mockResolvedValueOnce([{ path: 'src/App.tsx', type: 'file' }])
        const { default: opencodeFile } = await import('./file.js')

        const res = await opencodeFile.request('http://studio.local/api/file/list?path=src&workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json() as FileListResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({ entries: [{ path: 'src/App.tsx', type: 'file' }] })
        expect(opencodeServiceMock.listFiles).toHaveBeenCalledWith('/tmp/workspace', 'src')
    })

    it('wraps file status entries in the shared list response contract', async () => {
        opencodeServiceMock.getFileStatus.mockResolvedValueOnce([
            { path: 'src/App.tsx', added: 2, removed: 1, status: 'modified' },
        ])
        const { default: opencodeFile } = await import('./file.js')

        const res = await opencodeFile.request('http://studio.local/api/file/status?workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json() as FileStatusResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({ files: [{ path: 'src/App.tsx', added: 2, removed: 1, status: 'modified' }] })
    })

    it('wraps project search results in named shared response contracts', async () => {
        opencodeServiceMock.findTextInProject.mockResolvedValueOnce([{ path: 'src/App.tsx', line: 10 }])
        opencodeServiceMock.findFilesInProject.mockResolvedValueOnce(['src/App.tsx'])
        opencodeServiceMock.findSymbolsInProject.mockResolvedValueOnce([{ name: 'App', path: 'src/App.tsx' }])
        const { default: opencodeFile } = await import('./file.js')

        const textRes = await opencodeFile.request('http://studio.local/api/find/text?pattern=App&workingDir=%2Ftmp%2Fworkspace')
        const filesRes = await opencodeFile.request('http://studio.local/api/find/files?pattern=App&workingDir=%2Ftmp%2Fworkspace')
        const symbolsRes = await opencodeFile.request('http://studio.local/api/find/symbols?pattern=App&workingDir=%2Ftmp%2Fworkspace')

        expect(await textRes.json() as FindTextResponse).toEqual({ matches: [{ path: 'src/App.tsx', line: 10 }] })
        expect(await filesRes.json() as FindFilesResponse).toEqual({ files: ['src/App.tsx'] })
        expect(await symbolsRes.json() as FindSymbolsResponse).toEqual({ symbols: [{ name: 'App', path: 'src/App.tsx' }] })
    })

    it('uses list response contracts for recoverable file list failures', async () => {
        opencodeServiceMock.listFiles.mockRejectedValueOnce(new Error('files unavailable'))
        opencodeServiceMock.getFileStatus.mockRejectedValueOnce(new Error('status unavailable'))
        const { default: opencodeFile } = await import('./file.js')

        const listRes = await opencodeFile.request('http://studio.local/api/file/list')
        const statusRes = await opencodeFile.request('http://studio.local/api/file/status')

        expect(await listRes.json()).toEqual({ entries: [] })
        expect(await statusRes.json()).toEqual({ files: [] })
    })
})
