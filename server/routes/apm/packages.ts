import { Hono } from 'hono'

import type {
    ApmPackageCopyRequest,
    ApmPackageCopyResponse,
    ApmPackageDeleteResponse,
    ApmPackageListResponse,
    ApmPackageLockRegenerateRequest,
    ApmPackageReadResponse,
    ApmPackageSourceSyncResponse,
    ApmPackageWriteRequest,
    ApmPackageWriteResponse,
    ApmValidationRequest,
    ApmValidationResult,
} from '../../../shared/apm-contracts.js'
import { isApmPackageScope } from '../../../shared/apm-contracts.js'
import {
    validateApmPackageManifest,
} from '../../services/apm-package/manifest.js'
import {
    copyApmPackage,
    deleteApmPackage,
    listApmPackages,
    readApmPackage,
    writeApmPackage,
} from '../../services/apm-package/repository.js'
import {
    ApmPackageConflictError,
    listApmPackagePrimitiveFiles,
    readApmPackagePrimitiveFile,
    regenerateApmPackageLock,
    syncManagedApmPackageSourceToManifest,
} from '../../services/apm-package/package-source-files.js'
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

apmPackages.get('/api/apm/packages/:packageId/primitives', async (c) => {
    try {
        const response = await listApmPackagePrimitiveFiles(
            requestApmPackageWorkingDir(c, c.req.query('scope')),
            c.req.param('packageId'),
        )
        return c.json(response)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to list APM package primitives.'), 500)
    }
})

apmPackages.get('/api/apm/packages/:packageId/primitives/file', async (c) => {
    const filePath = c.req.query('path')
    if (!filePath?.trim()) {
        return jsonError(c, 'path is required.', 400)
    }
    try {
        const response = await readApmPackagePrimitiveFile(
            requestApmPackageWorkingDir(c, c.req.query('scope')),
            c.req.param('packageId'),
            filePath,
        )
        return c.json(response)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to read APM package primitive.'), 500)
    }
})

apmPackages.post('/api/apm/packages/:packageId/sync-source', async (c) => {
    try {
        const workingDir = requestApmPackageWorkingDir(c, c.req.query('scope'))
        const result = await syncManagedApmPackageSourceToManifest(
            workingDir,
            c.req.param('packageId'),
            readApmPackage,
        )
        if (!result.package) {
            return jsonError(c, 'APM package not found.', 404)
        }
        return c.json({
            ok: true,
            synced: result.synced,
            ...result.package,
        } satisfies ApmPackageSourceSyncResponse)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to sync APM package source.'), 500)
    }
})

apmPackages.post('/api/apm/packages/:packageId/lock/regenerate', async (c) => {
    const body = await c.req.json<ApmPackageLockRegenerateRequest>().catch((): ApmPackageLockRegenerateRequest => ({}))
    try {
        const workingDir = requestApmPackageWorkingDir(c, c.req.query('scope'))
        const readBack = await regenerateApmPackageLock(
            workingDir,
            c.req.param('packageId'),
            body?.baseManifestHash,
            readApmPackage,
        )
        if (!readBack) {
            return jsonError(c, 'APM package not found.', 404)
        }
        return c.json({ ok: true, ...readBack } satisfies ApmPackageWriteResponse)
    } catch (error) {
        return jsonError(
            c,
            errorMessage(error, 'Unable to regenerate APM package lock.'),
            error instanceof ApmPackageConflictError ? 409 : 500,
        )
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

apmPackages.post('/api/apm/packages/copy', async (c) => {
    const body = await c.req.json<ApmPackageCopyRequest>().catch(() => null)
    if (!body?.packageId || !body.packageId.trim()) {
        return jsonError(c, 'packageId is required.', 400)
    }
    if (!isApmPackageScope(body.fromScope) || !isApmPackageScope(body.toScope)) {
        return jsonError(c, 'fromScope and toScope must be workspace or user.', 400)
    }
    if (body.fromScope === body.toScope) {
        return jsonError(c, 'fromScope and toScope must be different.', 400)
    }

    try {
        const copied = await copyApmPackage(
            requestApmPackageWorkingDir(c, body.fromScope),
            requestApmPackageWorkingDir(c, body.toScope),
            body.packageId,
        )
        const response: ApmPackageCopyResponse = {
            ok: true,
            fromScope: body.fromScope,
            toScope: body.toScope,
            ...copied,
        }
        return c.json(response)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to copy APM package.'), 500)
    }
})

apmPackages.put('/api/apm/packages/:packageId', async (c) => {
    const body = await c.req.json<ApmPackageWriteRequest>().catch(() => null)
    if (!body?.manifest) {
        return jsonError(c, 'manifest is required.', 400)
    }
    try {
        const written = await writeApmPackage(
            requestApmPackageWorkingDir(c, c.req.query('scope')),
            c.req.param('packageId'),
            body.manifest,
            body.baseManifestHash,
        )
        const response: ApmPackageWriteResponse = { ok: true, ...written }
        return c.json(response)
    } catch (error) {
        return jsonError(
            c,
            errorMessage(error, 'Unable to write APM package.'),
            error instanceof ApmPackageConflictError ? 409 : 500,
        )
    }
})

apmPackages.delete('/api/apm/packages/:packageId', async (c) => {
    try {
        const deleted = await deleteApmPackage(requestApmPackageWorkingDir(c, c.req.query('scope')), c.req.param('packageId'))
        if (!deleted) {
            return jsonError(c, 'APM package not found.', 404)
        }
        const response: ApmPackageDeleteResponse = { ok: true, ...deleted }
        return c.json(response)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to delete APM package.'), 500)
    }
})

apmPackages.post('/api/apm/validate', async (c) => {
    const body = await c.req.json<ApmValidationRequest>().catch(() => null)
    const response: ApmValidationResult = validateApmPackageManifest(body?.manifest)
    return c.json(response)
})

export default apmPackages
