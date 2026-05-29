import { Hono } from 'hono'

import type {
    ApmPackageListResponse,
    ApmPackageReadResponse,
    ApmPackageWriteRequest,
    ApmPackageWriteResponse,
    ApmValidationRequest,
    ApmValidationResult,
} from '../../../shared/apm-contracts.js'
import {
    validateApmPackageManifest,
} from '../../services/apm-package/manifest.js'
import {
    listApmPackages,
    readApmPackage,
    writeApmPackage,
} from '../../services/apm-package/repository.js'
import { jsonError } from '../route-errors.js'
import { errorMessage, requestApmPackageWorkingDir } from './route-utils.js'

const apmPackages = new Hono()

apmPackages.get('/api/apm/packages', async (c) => {
    try {
        const workingDir = requestApmPackageWorkingDir(c, c.req.query('scope'))
        const response: ApmPackageListResponse = { packages: await listApmPackages(workingDir) }
        return c.json(response)
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
        return c.json(result satisfies ApmPackageReadResponse)
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
        const written = await writeApmPackage(requestApmPackageWorkingDir(c, c.req.query('scope')), c.req.param('packageId'), body.manifest)
        const response: ApmPackageWriteResponse = { ok: true, ...written }
        return c.json(response)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to write APM package.'), 500)
    }
})

apmPackages.post('/api/apm/validate', async (c) => {
    const body = await c.req.json<ApmValidationRequest>().catch(() => null)
    const response: ApmValidationResult = validateApmPackageManifest(body?.manifest)
    return c.json(response)
})

export default apmPackages
