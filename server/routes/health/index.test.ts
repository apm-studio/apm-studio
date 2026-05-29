import { describe, expect, it } from 'vitest'
import type { StudioHealthResponse } from '../../../shared/studio-contracts.js'

describe('health routes', () => {
    it('reports the request working directory only on the health boundary', async () => {
        const { default: healthRoutes } = await import('./index.js')

        const res = await healthRoutes.request('http://studio.local/api/health?workingDir=%2Ftmp%2Fstudio-workspace')
        const body = await res.json() as StudioHealthResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({ ok: true, project: '/tmp/studio-workspace' })
    })
})
