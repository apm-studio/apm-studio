import { Hono } from 'hono'
import type { AgentSyncRunRequest } from '../../shared/agent-sync-contracts.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import {
    getAgentSyncOverview,
    pruneAgentSync,
    runAgentSync,
} from '../services/agent-sync-service.js'
import { requestWorkingDir } from './route-errors.js'

const agentSync = new Hono()

agentSync.get('/api/agent-sync', async (c) => {
    try {
        return c.json(await getAgentSyncOverview(requestWorkingDir(c)))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

agentSync.post('/api/agent-sync/:providerId/sync', async (c) => {
    const body = await c.req.json<AgentSyncRunRequest>().catch((): AgentSyncRunRequest => ({}))
    try {
        return c.json(await runAgentSync(requestWorkingDir(c), c.req.param('providerId'), body))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

agentSync.post('/api/agent-sync/:providerId/prune', async (c) => {
    try {
        return c.json(await pruneAgentSync(requestWorkingDir(c), c.req.param('providerId')))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default agentSync
