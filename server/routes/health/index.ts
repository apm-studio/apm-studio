// Health Routes

import { Hono } from 'hono'
import type { StudioHealthResponse } from '../../../shared/studio-contracts.js'
import { requestWorkingDir } from '../route-errors.js'

const health = new Hono()

health.get('/api/health', (c) => {
    const response: StudioHealthResponse = { ok: true, project: requestWorkingDir(c) }
    return c.json(response)
})

export default health
