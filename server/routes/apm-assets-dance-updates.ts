import { Hono } from 'hono'
import type {
    ApmAssetDanceReimportSourceRequest,
    ApmAssetDanceUpdateApplyRequest,
    ApmAssetDanceUpdateCheckRequest,
} from '../../shared/apm-asset-contracts.js'
import {
    applyDanceGitHubUpdates,
    checkDanceGitHubUpdates,
    reimportDanceGitHubSource,
} from '../services/dance-github-update-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const apmAssetsDanceUpdates = new Hono()

function errorMessage(error: unknown, fallback = 'Unknown error') {
    return error instanceof Error && error.message ? error.message : fallback
}

apmAssetsDanceUpdates.post('/api/apm/assets/dance-updates/check', async (c) => {
    const body = await c.req.json<ApmAssetDanceUpdateCheckRequest>().catch(() => null)
    if (!body?.assets?.length) {
        return jsonError(c, 'At least one installed Skill is required.', 400)
    }

    try {
        return c.json({
            results: await checkDanceGitHubUpdates(requestWorkingDir(c), body.assets, body.includeRepoDrift === true),
        })
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to check GitHub Skill updates.'), 500)
    }
})

apmAssetsDanceUpdates.post('/api/apm/assets/dance-updates/apply', async (c) => {
    const body = await c.req.json<ApmAssetDanceUpdateApplyRequest>().catch(() => null)
    if (!body?.assets?.length) {
        return jsonError(c, 'At least one installed Skill is required.', 400)
    }

    try {
        return c.json(await applyDanceGitHubUpdates(requestWorkingDir(c), body.assets))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to update GitHub Skills.'), 500)
    }
})

apmAssetsDanceUpdates.post('/api/apm/assets/dance-updates/reimport-source', async (c) => {
    const body = await c.req.json<ApmAssetDanceReimportSourceRequest>().catch(() => null)
    if (!body?.urn || !body.scope) {
        return jsonError(c, 'Installed Skill URN and scope are required.', 400)
    }

    try {
        return c.json(await reimportDanceGitHubSource(requestWorkingDir(c), body))
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error, 'Failed to import newly available GitHub Skills.'), 500)
    }
})

export default apmAssetsDanceUpdates
