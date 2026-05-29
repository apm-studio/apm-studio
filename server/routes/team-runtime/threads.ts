import { Hono } from 'hono'
import type {
    TeamRuntimeErrorResponse,
    TeamRuntimeDefinitionPatchRequest,
    TeamRuntimeDeleteResponse,
    TeamThreadCreateRequest,
    TeamThreadCreateResponse,
    TeamThreadEventsResponse,
    TeamThreadRenameRequest,
    TeamThreadResponse,
    TeamThreadsResponse,
} from '../../../shared/team-types.js'
import { firstTeamDefinitionValidationError } from '../../../shared/team-definition-validation.js'
import { getTeamRuntimeService } from '../../services/team-runtime/team-runtime-service.js'
import { teamRuntimeError } from '../../services/team-runtime/team-runtime-results.js'
import { requestWorkingDir } from '../route-errors.js'
import { jsonTeamRuntimeError } from './route-errors.js'

const teamRuntimeThreads = new Hono()

function teamThreadValidationError(error: string): TeamRuntimeErrorResponse {
    return teamRuntimeError(error, 400)
}

teamRuntimeThreads.post('/api/team/:teamId/threads', async (c) => {
    const teamId = c.req.param('teamId')
    const body = await c.req.json<TeamThreadCreateRequest>().catch(() => ({ teamDefinition: undefined }))
    const validationError = firstTeamDefinitionValidationError(body.teamDefinition)
    if (validationError) {
        return c.json(teamThreadValidationError(validationError), 400)
    }

    const response = await getTeamRuntimeService(requestWorkingDir(c)).createThread(teamId, body.teamDefinition)
    return c.json(response satisfies TeamThreadCreateResponse)
})

teamRuntimeThreads.patch('/api/team/:teamId/runtime-definition', async (c) => {
    const teamId = c.req.param('teamId')
    const body = await c.req.json<Partial<TeamRuntimeDefinitionPatchRequest>>().catch(() => ({ teamDefinition: undefined }))
    const validationError = firstTeamDefinitionValidationError(body.teamDefinition)
    if (validationError || !body.teamDefinition) {
        return c.json(teamThreadValidationError(validationError || 'teamDefinition is required'), 400)
    }

    const response = await getTeamRuntimeService(requestWorkingDir(c)).syncTeamDefinition(teamId, body.teamDefinition)
    return c.json(response satisfies TeamThreadsResponse)
})

teamRuntimeThreads.get('/api/team/:teamId/threads', async (c) => {
    const teamId = c.req.param('teamId')
    const response = await getTeamRuntimeService(requestWorkingDir(c)).listThreads(teamId)
    return c.json(response satisfies TeamThreadsResponse)
})

teamRuntimeThreads.get('/api/team/:teamId/thread/:threadId', async (c) => {
    const threadId = c.req.param('threadId')
    const result = await getTeamRuntimeService(requestWorkingDir(c)).getThread(threadId)
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamThreadResponse)
})

teamRuntimeThreads.patch('/api/team/:teamId/thread/:threadId', async (c) => {
    const teamId = c.req.param('teamId')
    const threadId = c.req.param('threadId')
    const body = await c.req.json<Partial<TeamThreadRenameRequest>>().catch(() => ({} as Partial<TeamThreadRenameRequest>))
    const name = body.name?.trim()
    if (!name) {
        return c.json(teamThreadValidationError('Thread name is required'), 400)
    }

    const result = await getTeamRuntimeService(requestWorkingDir(c)).renameThread(teamId, threadId, name)
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamThreadResponse)
})

teamRuntimeThreads.get('/api/team/:teamId/thread/:threadId/events', async (c) => {
    const threadId = c.req.param('threadId')
    const parsedCount = parseInt(c.req.query('count') || '50', 10)
    const count = Number.isFinite(parsedCount) ? parsedCount : 50
    const before = Math.max(0, parseInt(c.req.query('before') || '0', 10) || 0)
    try {
        const response = await getTeamRuntimeService(requestWorkingDir(c)).getRecentEvents(threadId, count, before)
        return c.json(response satisfies TeamThreadEventsResponse)
    } catch {
        const response: TeamThreadEventsResponse = { ok: true, events: [], total: 0, hasMore: false, nextBefore: 0 }
        return c.json(response)
    }
})

teamRuntimeThreads.delete('/api/team/:teamId/thread/:threadId', async (c) => {
    const teamId = c.req.param('teamId')
    const threadId = c.req.param('threadId')
    const result = await getTeamRuntimeService(requestWorkingDir(c)).deleteThread(teamId, threadId)
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamRuntimeDeleteResponse)
})

teamRuntimeThreads.delete('/api/team/:teamId', async (c) => {
    const teamId = c.req.param('teamId')
    const response = await getTeamRuntimeService(requestWorkingDir(c)).deleteTeam(teamId)
    return c.json(response satisfies TeamRuntimeDeleteResponse)
})

export default teamRuntimeThreads
