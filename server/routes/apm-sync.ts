import { Hono } from 'hono'

import type { ApmSyncRunRequest } from '../../shared/apm-contracts.js'
import {
    getApmSyncTargets,
    getApmToolingStatus,
    runApmTargetSync,
} from '../services/apm-package-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'
import { errorMessage } from './apm-route-utils.js'

const apmSync = new Hono()

apmSync.get('/api/apm/tooling', async (c) => {
    try {
        return c.json({ tooling: await getApmToolingStatus() })
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to inspect APM tooling.'), 500)
    }
})

apmSync.get('/api/apm/targets', async (c) => {
    try {
        return c.json(await getApmSyncTargets())
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to inspect APM targets.'), 500)
    }
})

apmSync.post('/api/apm/sync', async (c) => {
    const body = await c.req.json<ApmSyncRunRequest>().catch(() => null)
    if (!body?.target && (!Array.isArray(body?.targets) || body.targets.length === 0)) {
        return jsonError(c, 'target or targets is required.', 400)
    }
    try {
        return c.json(await runApmTargetSync(requestWorkingDir(c), body))
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to sync APM target.'), 500)
    }
})

export default apmSync
