import { Hono } from 'hono'
import type { StudioAssetKind } from '../lib/roster-authoring.js'
import {
    installRosterAsset,
    saveRosterLocalAsset,
    uninstallRosterAsset,
    previewUninstallRosterAsset,
} from '../services/roster-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const rosterAssets = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

rosterAssets.post('/api/roster/install', async (c) => {
    const body = await c.req.json<{
        urn: string
        localName?: string
        force?: boolean
        scope?: 'global' | 'stage'
    }>()

    try {
        return c.json(await installRosterAsset(requestWorkingDir(c), body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

rosterAssets.put('/api/roster/assets/local', async (c) => {
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
        return c.json(await saveRosterLocalAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 400)
    }
})

rosterAssets.delete('/api/roster/assets/local', async (c) => {
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
        return c.json(await uninstallRosterAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
})

rosterAssets.post('/api/roster/assets/uninstall-preview', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: 'tal' | 'dance' | 'performer' | 'act'
        urn: string
    }>().catch(() => null)

    if (!body?.kind || !body?.urn) {
        return jsonError(c, 'kind and urn are required.', 400)
    }

    try {
        return c.json(await previewUninstallRosterAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 404)
    }
})

export default rosterAssets
