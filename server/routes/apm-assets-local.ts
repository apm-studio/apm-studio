import { Hono } from 'hono'
import type { StudioAssetKind } from '../lib/apm-asset-authoring.js'
import {
    installApmAsset,
    saveApmLocalAsset,
    uninstallApmAsset,
    previewUninstallApmAsset,
} from '../services/apm-asset-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const apmAssetsLocal = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

apmAssetsLocal.post('/api/apm/assets/install', async (c) => {
    const body = await c.req.json<{
        urn: string
        localName?: string
        force?: boolean
        scope?: 'global' | 'stage'
    }>()

    try {
        return c.json(await installApmAsset(requestWorkingDir(c), body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

apmAssetsLocal.put('/api/apm/assets/local', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: StudioAssetKind
        slug: string
        stage?: string
        author?: string
        payload: unknown
    }>().catch(() => null)

    if (!body?.kind || !body?.slug) {
        return jsonError(c, 'kind and slug are required.', 400)
    }

    try {
        return c.json(await saveApmLocalAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 400)
    }
})

apmAssetsLocal.delete('/api/apm/assets/local', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: 'tal' | 'dance' | 'performer' | 'act'
        urn: string
        cascade?: boolean
    }>().catch(() => null)

    if (!body?.kind || !body?.urn) {
        return jsonError(c, 'kind and urn are required.', 400)
    }

    try {
        return c.json(await uninstallApmAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
})

apmAssetsLocal.post('/api/apm/assets/uninstall-preview', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: 'tal' | 'dance' | 'performer' | 'act'
        urn: string
    }>().catch(() => null)

    if (!body?.kind || !body?.urn) {
        return jsonError(c, 'kind and urn are required.', 400)
    }

    try {
        return c.json(await previewUninstallApmAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
})

export default apmAssetsLocal
