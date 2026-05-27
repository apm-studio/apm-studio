import { Hono } from 'hono'
import {
    getApmAuthUser,
    getApmAssetStatusSnapshot,
    initApmAssetRegistry,
    loginToApm,
    logoutFromApm,
} from '../services/apm-asset-service.js'
import { addDanceFromGitHub } from '../services/apm-asset-add-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const apmAssetsCore = new Hono()

function errorMessage(error: unknown, fallback = 'Unknown error') {
    return error instanceof Error && error.message ? error.message : fallback
}

apmAssetsCore.get('/api/apm/assets/status', async (c) => {
    return c.json(await getApmAssetStatusSnapshot(requestWorkingDir(c)))
})

apmAssetsCore.post('/api/apm/assets/init', async (c) => {
    const { scope } = await c.req.json<{ scope?: string }>().catch(() => ({ scope: undefined }))
    try {
        return c.json(await initApmAssetRegistry(requestWorkingDir(c), scope))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

apmAssetsCore.get('/api/apm/assets/auth-user', async () => {
    try {
        return Response.json(await getApmAuthUser())
    } catch (error: unknown) {
        return Response.json({ authenticated: false, username: null, error: errorMessage(error) }, { status: 500 })
    }
})

apmAssetsCore.post('/api/apm/assets/login', async (c) => {
    const body = await c.req.json<{ acknowledgedTos?: boolean }>().catch((): { acknowledgedTos?: boolean } => ({}))
    if (!body?.acknowledgedTos) {
        return jsonError(c, 'Review and accept the APM Studio Terms of Service before signing in: https://apm.studio/tos', 400)
    }

    try {
        return c.json(await loginToApm())
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to start APM Studio login.'), 500)
    }
})

apmAssetsCore.post('/api/apm/assets/logout', async (c) => {
    try {
        return c.json(await logoutFromApm())
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to sign out.'), 500)
    }
})

apmAssetsCore.post('/api/apm/assets/add', async (c) => {
    const { source, scope } = await c.req.json<{ source: string; scope?: 'global' | 'stage' }>()
    if (!source?.trim()) {
        return jsonError(c, 'Missing source (e.g. owner/repo)', 400)
    }
    try {
        const result = await addDanceFromGitHub(requestWorkingDir(c), source.trim(), scope)
        return c.json(result)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to add Skill from GitHub.'), 500)
    }
})

export default apmAssetsCore
