import { Hono } from 'hono'
import type {
    ApmPackageImportRequest,
    ApmPackageWriteRequest,
} from '../../shared/apm-contracts.js'
import {
    exportApmPackage,
    importApmPackage,
    listApmPackages,
    readApmPackage,
    validateApmPackageManifest,
    writeApmPackage,
} from '../services/apm-package-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const apm = new Hono()

function errorMessage(error: unknown, fallback = 'APM package operation failed.') {
    return error instanceof Error && error.message ? error.message : fallback
}

apm.get('/api/apm/packages', async (c) => {
    try {
        return c.json({ packages: await listApmPackages(requestWorkingDir(c)) })
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to list APM packages.'), 500)
    }
})

apm.get('/api/apm/packages/:packageId', async (c) => {
    try {
        const result = await readApmPackage(requestWorkingDir(c), c.req.param('packageId'))
        if (!result) {
            return jsonError(c, 'APM package not found.', 404)
        }
        return c.json(result)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to read APM package.'), 500)
    }
})

apm.put('/api/apm/packages/:packageId', async (c) => {
    const body = await c.req.json<ApmPackageWriteRequest>().catch(() => null)
    if (!body?.manifest) {
        return jsonError(c, 'manifest is required.', 400)
    }
    try {
        return c.json({ ok: true, ...await writeApmPackage(requestWorkingDir(c), c.req.param('packageId'), body.manifest) })
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to write APM package.'), 500)
    }
})

apm.post('/api/apm/packages/:packageId/export', async (c) => {
    try {
        const result = await exportApmPackage(requestWorkingDir(c), c.req.param('packageId'))
        if (!result) {
            return jsonError(c, 'APM package not found.', 404)
        }
        return c.json(result)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to export APM package.'), 500)
    }
})

apm.post('/api/apm/import', async (c) => {
    const body = await c.req.json<ApmPackageImportRequest>().catch(() => null)
    if (!body) {
        return jsonError(c, 'Request body is required.', 400)
    }
    try {
        return c.json({ ok: true, ...await importApmPackage(requestWorkingDir(c), body) }, 201)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to import APM package.'), 500)
    }
})

apm.post('/api/apm/validate', async (c) => {
    const body = await c.req.json<{ manifest?: unknown }>().catch(() => null)
    return c.json(validateApmPackageManifest(body?.manifest))
})

export default apm
