import { Hono } from 'hono'

import type {
    ApmGitHubImportRequest,
    ApmGitHubImportResponse,
    ApmGitHubImportPreviewResponse,
    ApmGitHubSourceCatalogRequest,
    ApmGitHubSourceCatalogResponse,
    ApmPackageImportRequest,
    ApmPackageImportResponse,
    ApmTargetDefinitionImportRequest,
    ApmTargetDefinitionImportResponse,
} from '../../../shared/apm-contracts.js'
import {
    importApmPackagesFromGitHub,
    listApmGitHubSourceItems,
    previewApmPackagesFromGitHub,
} from '../../services/apm-package/github-import.js'
import { importApmPackageFromTargetDefinition } from '../../services/apm-package/local-target-import.js'
import { importApmPackage } from '../../services/apm-package/repository.js'
import { recordImportCatalogDownload, searchImportCatalog } from '../../services/import/registry-service.js'
import { jsonError, requestWorkingDir } from '../route-errors.js'
import { errorMessage, requestApmPackageWorkingDir } from './route-utils.js'

const apmImport = new Hono()

apmImport.post('/api/apm/import', async (c) => {
    const body = await c.req.json<ApmPackageImportRequest>().catch(() => null)
    if (!body) {
        return jsonError(c, 'Request body is required.', 400)
    }
    try {
        const imported = await importApmPackage(requestApmPackageWorkingDir(c, body.scope), body)
        const response: ApmPackageImportResponse = { ok: true, ...imported }
        return c.json(response, 201)
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
        const response = await importApmPackagesFromGitHub(requestWorkingDir(c), body)
        await recordImportCatalogDownload(body, response).catch(() => undefined)
        return c.json(response satisfies ApmGitHubImportResponse, 201)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to import GitHub source as APM packages.'), 500)
    }
})

apmImport.post('/api/apm/import/target-definition', async (c) => {
    const body = await c.req.json<ApmTargetDefinitionImportRequest>().catch(() => null)
    if (!body) {
        return jsonError(c, 'Request body is required.', 400)
    }
    try {
        const response = await importApmPackageFromTargetDefinition(requestWorkingDir(c), body)
        return c.json(response satisfies ApmTargetDefinitionImportResponse, 201)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to import target definition as an APM package.'), 500)
    }
})

apmImport.get('/api/apm/import/catalog', async (c) => {
    try {
        const response = await searchImportCatalog({
            q: c.req.query('q'),
            kind: c.req.query('kind') as never,
            target: c.req.query('target') as never,
            tag: c.req.query('tag'),
            limit: Number.parseInt(c.req.query('limit') || '20', 10),
            cursor: c.req.query('cursor'),
        })
        return c.json(response)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to search APM Registry.'), 500)
    }
})

apmImport.post('/api/apm/import/github/preview', async (c) => {
    const body = await c.req.json<ApmGitHubImportRequest>().catch(() => null)
    if (!body) {
        return jsonError(c, 'Request body is required.', 400)
    }
    try {
        const response = await previewApmPackagesFromGitHub(body)
        return c.json(response satisfies ApmGitHubImportPreviewResponse)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to preview GitHub source as APM packages.'), 500)
    }
})

apmImport.post('/api/apm/github-catalog', async (c) => {
    const body = await c.req.json<ApmGitHubSourceCatalogRequest>().catch(() => ({}))
    try {
        const response = await listApmGitHubSourceItems(body || {})
        return c.json(response satisfies ApmGitHubSourceCatalogResponse)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to build GitHub source catalog.'), 500)
    }
})

export default apmImport
