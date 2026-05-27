import { Hono } from 'hono'

import type {
    ApmPackageWriteRequest,
} from '../../shared/apm-contracts.js'
import {
    exportApmPackage,
    listApmPackages,
    readApmPackage,
    validateApmPackageManifest,
    writeApmPackage,
} from '../services/apm-package-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'
import { errorMessage, requestApmPackageWorkingDir } from './apm-route-utils.js'

const apmPackages = new Hono()

apmPackages.get('/api/apm/packages', async (c) => {
    try {
        const workingDir = requestApmPackageWorkingDir(c, c.req.query('scope'))
        return c.json({ packages: await listApmPackages(workingDir) })
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to list APM packages.'), 500)
    }
})

apmPackages.get('/api/apm/packages/:packageId', async (c) => {
    try {
        const result = await readApmPackage(requestApmPackageWorkingDir(c, c.req.query('scope')), c.req.param('packageId'))
        if (!result) {
            return jsonError(c, 'APM package not found.', 404)
        }
        return c.json(result)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to read APM package.'), 500)
    }
})

apmPackages.put('/api/apm/packages/:packageId', async (c) => {
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

apmPackages.post('/api/apm/packages/:packageId/export', async (c) => {
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

apmPackages.post('/api/apm/validate', async (c) => {
    const body = await c.req.json<{ manifest?: unknown }>().catch(() => null)
    return c.json(validateApmPackageManifest(body?.manifest))
})

export default apmPackages
