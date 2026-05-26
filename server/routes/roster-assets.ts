import { Hono } from 'hono'
import type { StudioAssetKind } from '../lib/roster-authoring.js'
import {
    installRosterAsset,
    publishRosterAsset,
    saveRosterLocalAsset,
    uninstallRosterAsset,
    previewUninstallRosterAsset,
} from '../services/roster-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const rosterAssets = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

function errorStatus(error: unknown) {
    return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
        ? error.status
        : undefined
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

rosterAssets.post('/api/roster/assets/publish', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<{
        kind: StudioAssetKind
        slug: string
        stage?: string
        payload?: unknown
        tags?: string[]
        providedAssets?: Array<{
            kind: 'tal' | 'performer' | 'act'
            urn: string
            payload: Record<string, unknown>
            tags?: string[]
        }>
        acknowledgedTos?: boolean
    }>().catch(() => null)

    if (!body?.kind || !body?.slug) {
        return jsonError(c, 'kind and slug are required.', 400)
    }
    if (!body.acknowledgedTos) {
        return jsonError(c, 'Review and accept the Agent Roster Terms of Service before publishing: https://agentroster.dev/tos', 400)
    }

    try {
        return c.json(await publishRosterAsset(cwd, body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), errorStatus(error) === 401 ? 401 : 400)
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
