import { Hono } from 'hono'
import type {
    ChatOkResponse,
    ChatPendingPermissionsResponse,
    ChatPendingQuestionsResponse,
    ChatRevertRequest,
    ChatSessionCreateRequest,
    ChatSessionCreateResponse,
    ChatSessionListResponse,
    ChatSessionPermissionRespondRequest,
    ChatSessionRevertResponse,
    ChatSessionStatusResponse,
    ChatSessionTodosResponse,
    ChatSessionUpdateRequest,
    ChatSessionUpdateResponse,
    ChatSummarizeRequest,
    ChatSummarizeResponse,
    ChatSessionUnrevertResponse,
} from '../../../shared/chat-contracts.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../../lib/opencode-errors.js'
import { createStudioChatSession } from '../../services/chat/message-service.js'
import {
    abortStudioChatSession,
    deleteStudioChatSession,
    getStudioChatSessionStatus,
    listStudioChatSessions,
    renameStudioChatSession,
    respondSessionPermission,
    revertStudioChatSession,
    summarizeStudioChatSession,
    unrevertStudioChatSession,
    listPendingPermissions,
    listPendingQuestions,
    listStudioSessionTodos,
} from '../../services/chat/session-service.js'
import { requestWorkingDir } from '../route-errors.js'

const chatSessions = new Hono()

chatSessions.post('/api/chat/sessions', async (c) => {
    const body = await c.req.json<ChatSessionCreateRequest>()
    try {
        const response: ChatSessionCreateResponse = await createStudioChatSession(requestWorkingDir(c), body)
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.get('/api/chat/sessions', async (c) => {
    try {
        const response: ChatSessionListResponse = {
            sessions: await listStudioChatSessions(requestWorkingDir(c)),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.get('/api/chat/sessions/:id/status', async (c) => {
    try {
        const response = await getStudioChatSessionStatus(requestWorkingDir(c), c.req.param('id'))
        return c.json(response satisfies ChatSessionStatusResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.get('/api/chat/sessions/:id/todos', async (c) => {
    try {
        const response: ChatSessionTodosResponse = {
            todos: await listStudioSessionTodos(requestWorkingDir(c), c.req.param('id')),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.delete('/api/chat/sessions/:id', async (c) => {
    try {
        const response = await deleteStudioChatSession(requestWorkingDir(c), c.req.param('id'))
        return c.json(response satisfies ChatOkResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.put('/api/chat/sessions/:id', async (c) => {
    const body = await c.req.json<Partial<ChatSessionUpdateRequest>>().catch(() => ({} as Partial<ChatSessionUpdateRequest>))
    const title = body.title
    if (!title || !title.trim()) {
        return jsonOpencodeError(
            c,
            new StudioValidationError('Thread title is required.', 'fix_input'),
        )
    }

    try {
        const response = await renameStudioChatSession(requestWorkingDir(c), c.req.param('id'), title.trim())
        return c.json(response satisfies ChatSessionUpdateResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/abort', async (c) => {
    try {
        const response = await abortStudioChatSession(requestWorkingDir(c), c.req.param('id'))
        return c.json(response satisfies ChatOkResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/permission/:pid/respond', async (c) => {
    const { response } = await c.req.json<ChatSessionPermissionRespondRequest>()
    try {
        const result = await respondSessionPermission(requestWorkingDir(c), c.req.param('id'), c.req.param('pid'), response)
        return c.json(result satisfies ChatOkResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/summarize', async (c) => {
    const { providerId, modelId, auto } = await c.req.json<ChatSummarizeRequest>()
    try {
        const response = await summarizeStudioChatSession(requestWorkingDir(c), c.req.param('id'), { providerId, modelId, auto })
        return c.json(response satisfies ChatSummarizeResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/revert', async (c) => {
    const { messageId, partId } = await c.req.json<ChatRevertRequest>()
    try {
        const response = await revertStudioChatSession(requestWorkingDir(c), c.req.param('id'), { messageId, partId })
        return c.json(response satisfies ChatSessionRevertResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.post('/api/chat/sessions/:id/unrevert', async (c) => {
    try {
        const response = await unrevertStudioChatSession(requestWorkingDir(c), c.req.param('id'))
        return c.json(response satisfies ChatSessionUnrevertResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.get('/api/chat/permissions', async (c) => {
    try {
        const response: ChatPendingPermissionsResponse = {
            permissions: await listPendingPermissions(requestWorkingDir(c)),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatSessions.get('/api/chat/questions', async (c) => {
    try {
        const response: ChatPendingQuestionsResponse = {
            questions: await listPendingQuestions(requestWorkingDir(c)),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default chatSessions
