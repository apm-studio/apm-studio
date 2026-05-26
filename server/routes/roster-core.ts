import { Hono } from 'hono'
import {
    getRosterAuthUser,
    getRosterStatusSnapshot,
    initRosterRegistry,
    loginToRoster,
    logoutFromRoster,
} from '../services/roster-service.js'
import { addDanceFromGitHub } from '../services/roster-add-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const rosterCore = new Hono()

function errorMessage(error: unknown, fallback = 'Unknown error') {
    return error instanceof Error && error.message ? error.message : fallback
}

rosterCore.get('/api/roster/status', async (c) => {
    return c.json(await getRosterStatusSnapshot(requestWorkingDir(c)))
})

rosterCore.post('/api/roster/init', async (c) => {
    const { scope } = await c.req.json<{ scope?: string }>().catch(() => ({ scope: undefined }))
    try {
        return c.json(await initRosterRegistry(requestWorkingDir(c), scope))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

rosterCore.get('/api/roster/auth-user', async () => {
    try {
        return Response.json(await getRosterAuthUser())
    } catch (error: unknown) {
        return Response.json({ authenticated: false, username: null, error: errorMessage(error) }, { status: 500 })
    }
})

rosterCore.post('/api/roster/login', async (c) => {
    const body = await c.req.json<{ acknowledgedTos?: boolean }>().catch((): { acknowledgedTos?: boolean } => ({}))
    if (!body?.acknowledgedTos) {
        return jsonError(c, 'Review and accept the Agent Roster Terms of Service before signing in: https://agentroster.dev/tos', 400)
    }

    try {
        return c.json(await loginToRoster())
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to start Agent Roster login.'), 500)
    }
})

rosterCore.post('/api/roster/logout', async (c) => {
    try {
        return c.json(await logoutFromRoster())
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to sign out.'), 500)
    }
})

rosterCore.post('/api/roster/add', async (c) => {
    const { source, scope } = await c.req.json<{ source: string; scope?: 'global' | 'stage' }>()
    if (!source?.trim()) {
        return jsonError(c, 'Missing source (e.g. owner/repo)', 400)
    }
    try {
        const result = await addDanceFromGitHub(requestWorkingDir(c), source.trim(), scope)
        return c.json(result)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to add dance from GitHub.'), 500)
    }
})

export default rosterCore
