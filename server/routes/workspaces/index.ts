// Workspace CRUD Routes — with path validation

import { Hono } from 'hono'
import type {
    SavedWorkspaceListResponse,
    SavedWorkspaceSnapshot,
    SetWorkspaceHiddenRequest,
} from '../../../shared/workspace-contracts.js'
import {
    deleteSavedWorkspace,
    getSavedWorkspace,
    listSavedWorkspaces,
    saveWorkspaceSnapshot,
    setSavedWorkspaceHidden,
} from '../../services/workspace/service.js'
import { jsonServiceFailure } from '../route-errors.js'

const workspaces = new Hono()

function registerWorkspaceRoutes(basePath: '/api/workspaces') {
    workspaces.get(basePath, async (c) => {
        try {
            const response: SavedWorkspaceListResponse = {
                workspaces: await listSavedWorkspaces(c.req.query('includeHidden') === '1'),
            }
            return c.json(response)
        } catch {
            return c.json({ workspaces: [] } satisfies SavedWorkspaceListResponse)
        }
    })

    workspaces.get(`${basePath}/:id`, async (c) => {
        const result = await getSavedWorkspace(c.req.param('id'))
        if (!result.ok) {
            return jsonServiceFailure(c, result)
        }
        return c.json(result.workspace satisfies SavedWorkspaceSnapshot)
    })

    workspaces.put(basePath, async (c) => {
        const body = await c.req.json<SavedWorkspaceSnapshot>()
        const result = await saveWorkspaceSnapshot(body)
        if (!result.ok) {
            return jsonServiceFailure(c, result)
        }
        return c.json(result)
    })

    workspaces.patch(`${basePath}/:id`, async (c) => {
        const body = await c.req.json<SetWorkspaceHiddenRequest>().catch((): SetWorkspaceHiddenRequest => ({}))
        const result = await setSavedWorkspaceHidden(c.req.param('id'), body.hiddenFromList === true)
        if (!result.ok) {
            return jsonServiceFailure(c, result)
        }
        return c.json(result)
    })

    workspaces.delete(`${basePath}/:id`, async (c) => {
        const result = await deleteSavedWorkspace(c.req.param('id'))
        if (!result.ok) {
            return jsonServiceFailure(c, result)
        }
        return c.json(result)
    })
}

registerWorkspaceRoutes('/api/workspaces')

export default workspaces
