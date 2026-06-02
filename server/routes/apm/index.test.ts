import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ApiErrorResponse } from '../../../shared/api-contracts.js'
import type { ApmPackageDeleteResponse, ApmValidationResult } from '../../../shared/apm-contracts.js'
import { writeApmPackage } from '../../services/apm-package/repository.js'

describe('APM routes', () => {
    it('does not expose the removed package transfer endpoint', async () => {
        const { default: apmRoutes } = await import('./index.js')

        const res = await apmRoutes.request('http://studio.local/api/apm/packages/agent-1/export?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
        })

        expect(res.status).toBe(404)
    })

    it('keeps manifest validation on the package route boundary', async () => {
        const { default: apmRoutes } = await import('./index.js')

        const res = await apmRoutes.request('http://studio.local/api/apm/validate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                manifest: {
                    name: 'review-agent',
                    version: '0.1.0',
                    'x-apm': {
                        schemaVersion: 1,
                        packageId: 'review-agent',
                        kind: 'agent',
                    },
                },
            }),
        })
        const body = await res.json() as ApmValidationResult

        expect(res.status).toBe(200)
        expect(body).toEqual({ valid: true, errors: [], warnings: [] })
    })

    it('deletes packages through the package route boundary', async () => {
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-route-delete-'))
        try {
            await writeApmPackage(workingDir, 'delete-me', {
                name: 'delete-me',
                version: '1.0.0',
                'x-apm': {
                    schemaVersion: 1,
                    packageId: 'delete-me',
                    kind: 'package',
                },
            })
            const { default: apmRoutes } = await import('./index.js')

            const res = await apmRoutes.request(`http://studio.local/api/apm/packages/delete-me?workingDir=${encodeURIComponent(workingDir)}`, {
                method: 'DELETE',
            })
            const body = await res.json() as ApmPackageDeleteResponse

            expect(res.status).toBe(200)
            expect(body).toEqual({ ok: true, packageId: 'delete-me' })
            await expect(fs.stat(path.join(workingDir, 'packages', 'delete-me')))
                .rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('rejects unknown sync units on the route boundary', async () => {
        const { default: apmRoutes } = await import('./index.js')

        const res = await apmRoutes.request('http://studio.local/api/apm/sync?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                targets: ['codex'],
                syncUnit: 'unknown',
                packageIds: ['agent-1'],
            }),
        })
        const body = await res.json() as ApiErrorResponse

        expect(res.status).toBe(400)
        expect(body.error).toBe('Unsupported syncUnit.')
    })
})
