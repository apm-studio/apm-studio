import { Hono } from 'hono'

import type {
    ApmToolingResponse,
} from '../../../shared/apm-contracts.js'
import type {
    ApmSyncRunRequest,
    ApmSyncRunResponse,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-sync-contracts.js'
import { isApmSyncUnit } from '../../../shared/apm-sync-contracts.js'
import {
    getApmSyncTargets,
    runApmTargetSync,
} from '../../services/apm-package/target-sync.js'
import { getApmToolingStatus } from '../../services/apm-package/tooling.js'
import { jsonError, requestWorkingDir } from '../route-errors.js'
import { errorMessage } from './route-utils.js'

const apmSync = new Hono()

apmSync.get('/api/apm/tooling', async (c) => {
    try {
        const response: ApmToolingResponse = { tooling: await getApmToolingStatus() }
        return c.json(response)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to inspect APM tooling.'), 500)
    }
})

apmSync.get('/api/apm/targets', async (c) => {
    try {
        const response = await getApmSyncTargets(requestWorkingDir(c))
        return c.json(response satisfies ApmSyncTargetsResponse)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to inspect APM targets.'), 500)
    }
})

apmSync.post('/api/apm/sync', async (c) => {
    const body = await c.req.json<ApmSyncRunRequest>().catch(() => null)
    if (!Array.isArray(body?.targets) || body.targets.length === 0) {
        return jsonError(c, 'targets is required.', 400)
    }
    if (body.syncUnit !== undefined && !isApmSyncUnit(body.syncUnit)) {
        return jsonError(c, 'Unsupported syncUnit.', 400)
    }
    try {
        const response = await runApmTargetSync(requestWorkingDir(c), body)
        return c.json(response satisfies ApmSyncRunResponse)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to sync APM target.'), 500)
    }
})

export default apmSync
