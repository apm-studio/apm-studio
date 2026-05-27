import { Hono } from 'hono'

import type {
    ApmGitHubImportRequest,
    ApmGitHubSourceCatalogRequest,
    ApmPackageImportRequest,
} from '../../shared/apm-contracts.js'
import {
    importApmPackage,
    importApmPackagesFromGitHub,
    listApmGitHubSourceAssets,
    previewApmPackagesFromGitHub,
} from '../services/apm-package-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'
import { errorMessage } from './apm-route-utils.js'

const apmImport = new Hono()

apmImport.post('/api/apm/import', async (c) => {
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

apmImport.post('/api/apm/import/github', async (c) => {
    const body = await c.req.json<ApmGitHubImportRequest>().catch(() => null)
    if (!body) {
        return jsonError(c, 'Request body is required.', 400)
    }
    try {
        return c.json(await importApmPackagesFromGitHub(requestWorkingDir(c), body), 201)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to import GitHub source as APM packages.'), 500)
    }
})

apmImport.post('/api/apm/import/github/preview', async (c) => {
    const body = await c.req.json<ApmGitHubImportRequest>().catch(() => null)
    if (!body) {
        return jsonError(c, 'Request body is required.', 400)
    }
    try {
        return c.json(await previewApmPackagesFromGitHub(body))
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to preview GitHub source as APM packages.'), 500)
    }
})

apmImport.post('/api/apm/github-catalog', async (c) => {
    const body = await c.req.json<ApmGitHubSourceCatalogRequest>().catch(() => ({}))
    try {
        return c.json(await listApmGitHubSourceAssets(body || {}))
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to build GitHub source catalog.'), 500)
    }
})

export default apmImport
