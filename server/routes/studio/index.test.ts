import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiErrorResponse } from '../../../shared/api-contracts.js'

const studioServiceMock = vi.hoisted(() => ({
    activateStudioProject: vi.fn(),
    getStudioConfig: vi.fn(),
    openStudioPath: vi.fn(),
    pickDirectory: vi.fn(),
    pickWorkingDirectory: vi.fn(),
    updateStudioConfig: vi.fn(),
}))

vi.mock('../../services/studio/service.js', () => studioServiceMock)

describe('studio routes', () => {
    beforeEach(() => {
        Object.values(studioServiceMock).forEach((mock) => mock.mockReset())
    })

    it('serves Studio config through the Studio route boundary', async () => {
        studioServiceMock.getStudioConfig.mockResolvedValue({ theme: 'dark', projectDir: '/tmp/project' })
        const { default: studioRoutes } = await import('./index.js')

        const res = await studioRoutes.request('http://studio.local/api/studio/config')
        const body = await res.json() as { theme: string; projectDir: string }

        expect(res.status).toBe(200)
        expect(body).toEqual({ theme: 'dark', projectDir: '/tmp/project' })
        expect(studioServiceMock.getStudioConfig).toHaveBeenCalled()
    })

    it('returns service failures from Studio activation consistently', async () => {
        studioServiceMock.activateStudioProject.mockResolvedValue({
            ok: false,
            status: 400,
            error: 'workingDir is required',
            detail: 'Pick a project directory.',
            code: 'validation',
            action: 'fix_input',
        })
        const { default: studioRoutes } = await import('./index.js')

        const res = await studioRoutes.request('http://studio.local/api/studio/activate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workingDir: '' }),
        })
        const body = await res.json() as ApiErrorResponse

        expect(res.status).toBe(400)
        expect(body).toEqual({
            error: 'workingDir is required',
            detail: 'Pick a project directory.',
            code: 'validation',
            action: 'fix_input',
        })
    })
})
