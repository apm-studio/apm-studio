import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiErrorResponse } from '../../../shared/api-contracts.js'
import type { SavedWorkspaceListResponse } from '../../../shared/workspace-contracts.js'

const workspaceServiceMock = vi.hoisted(() => ({
    deleteSavedWorkspace: vi.fn(),
    getSavedWorkspace: vi.fn(),
    listSavedWorkspaces: vi.fn(),
    saveWorkspaceSnapshot: vi.fn(),
    setSavedWorkspaceHidden: vi.fn(),
}))

vi.mock('../../services/workspace/service.js', () => workspaceServiceMock)

describe('workspace routes', () => {
    beforeEach(() => {
        Object.values(workspaceServiceMock).forEach((mock) => mock.mockReset())
    })

    it('wraps saved workspace summaries in the shared list response contract', async () => {
        workspaceServiceMock.listSavedWorkspaces.mockResolvedValueOnce([
            { id: 'workspace-1', workingDir: '/tmp/project', updatedAt: 123 },
        ])
        const { default: workspaceRoutes } = await import('./index.js')

        const res = await workspaceRoutes.request('http://studio.local/api/workspaces?includeHidden=1')
        const body = await res.json() as SavedWorkspaceListResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({
            workspaces: [
                { id: 'workspace-1', workingDir: '/tmp/project', updatedAt: 123 },
            ],
        })
        expect(workspaceServiceMock.listSavedWorkspaces).toHaveBeenCalledWith(true)
    })

    it('uses the list response contract for recoverable list failures', async () => {
        workspaceServiceMock.listSavedWorkspaces.mockRejectedValueOnce(new Error('unreadable'))
        const { default: workspaceRoutes } = await import('./index.js')

        const res = await workspaceRoutes.request('http://studio.local/api/workspaces')
        const body = await res.json() as SavedWorkspaceListResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({ workspaces: [] })
    })

    it('returns shared API errors for workspace service failures', async () => {
        workspaceServiceMock.getSavedWorkspace.mockResolvedValueOnce({
            ok: false,
            status: 404,
            error: 'Workspace not found',
        })
        const { default: workspaceRoutes } = await import('./index.js')

        const res = await workspaceRoutes.request('http://studio.local/api/workspaces/missing')
        const body = await res.json() as ApiErrorResponse

        expect(res.status).toBe(404)
        expect(body).toEqual({ error: 'Workspace not found' })
    })
})
