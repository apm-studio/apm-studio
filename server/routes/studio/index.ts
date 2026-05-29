// Studio Config & Activation Routes

import { Hono } from 'hono'
import type {
    StudioActivateRequest,
    StudioConfigResponse,
    StudioConfigPatch,
    StudioOpenPathRequest,
    StudioPickDirectoryResponse,
} from '../../../shared/studio-contracts.js'
import {
    activateStudioProject,
    getStudioConfig,
    openStudioPath,
    pickDirectory,
    pickWorkingDirectory,
    updateStudioConfig,
} from '../../services/studio/service.js'
import { jsonError, jsonServiceFailure } from '../route-errors.js'

const studio = new Hono()

studio.get('/api/studio/pick-directory', async (c) => {
    try {
        const prompt = c.req.query('prompt')
        const response: StudioPickDirectoryResponse = prompt
            ? await pickDirectory(prompt)
            : await pickWorkingDirectory()
        return c.json(response)
    } catch (error) {
        return jsonError(c, error instanceof Error ? error.message : 'Selection cancelled or failed', 400)
    }
})

studio.get('/api/studio/config', async (c) => {
    const response: StudioConfigResponse = await getStudioConfig()
    return c.json(response)
})

studio.put('/api/studio/config', async (c) => {
    const body = await c.req.json<StudioConfigPatch>()
    const response: StudioConfigResponse = await updateStudioConfig(body)
    return c.json(response)
})

studio.post('/api/studio/activate', async (c) => {
    const { workingDir } = await c.req.json<StudioActivateRequest>()
    const result = await activateStudioProject(workingDir)
    if (!result.ok) {
        return jsonServiceFailure(c, result)
    }
    return c.json(result)
})

studio.post('/api/studio/open-path', async (c) => {
    const { path } = await c.req.json<StudioOpenPathRequest>()
    const result = await openStudioPath(path)
    if (!result.ok) {
        return jsonServiceFailure(c, result)
    }
    return c.json(result)
})

export default studio
