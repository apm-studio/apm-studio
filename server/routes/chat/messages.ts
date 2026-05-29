import { Hono } from 'hono'
import type { Context } from 'hono'
import type {
    ChatOkResponse,
    ChatQuestionRespondRequest,
    ChatSendRequest,
    ChatSendResponse,
    ChatSessionDiffResponse,
    ChatSessionMessagesRequest,
    ChatSessionMessagesResponse,
    ChatSessionResolveResponse,
} from '../../../shared/chat-contracts.js'
import { uniquePrimitiveRefs } from '../../lib/chat-session.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../../lib/opencode-errors.js'
import { sendStudioChatMessage } from '../../services/chat/message-service.js'
import { resolveSessionOwnership } from '../../services/chat/session-ownership-service.js'
import {
    listStudioSessionDiff,
    listStudioSessionMessages,
    rejectQuestion,
    respondQuestion,
} from '../../services/chat/session-service.js'
import { requestWorkingDir } from '../route-errors.js'

const chatMessages = new Hono()

function parseMessagesQuery(c: Context): ChatSessionMessagesRequest {
    const rawLimit = c.req.query('limit')
    const rawBefore = c.req.query('before')

    let limit: number | undefined
    if (typeof rawLimit === 'string' && rawLimit.trim().length > 0) {
        const parsed = Number.parseInt(rawLimit, 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new StudioValidationError('Query "limit" must be a positive integer.', 'fix_input')
        }
        limit = parsed
    }

    const before = typeof rawBefore === 'string' && rawBefore.trim().length > 0
        ? rawBefore.trim()
        : undefined

    return {
        limit,
        before,
    }
}

chatMessages.post('/api/chat/sessions/:id/send', async (c) => {
    const body = await c.req.json<ChatSendRequest>()

    if (!body.agent?.model) {
        return jsonOpencodeError(
            c,
            new StudioValidationError(
                'Select a model for this agent before sending prompts.',
                'select_model',
            ),
        )
    }

    try {
        const workingDir = requestWorkingDir(c)
        const normalizedBody: ChatSendRequest = {
            ...body,
            agent: {
                ...body.agent,
                skillRefs: uniquePrimitiveRefs(body.agent?.skillRefs || []),
                extraSkillRefs: uniquePrimitiveRefs(body.agent?.extraSkillRefs || []),
            },
        }
        const result = await sendStudioChatMessage(workingDir, c.req.param('id'), normalizedBody)
        return c.json(result satisfies ChatSendResponse, 202)
    } catch (err) {
        return jsonOpencodeError(c, err, { model: body.agent?.model })
    }
})

chatMessages.post('/api/chat/questions/:qid/respond', async (c) => {
    const { answers } = await c.req.json<ChatQuestionRespondRequest>()
    try {
        const response = await respondQuestion(requestWorkingDir(c), c.req.param('qid'), answers)
        return c.json(response satisfies ChatOkResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatMessages.post('/api/chat/questions/:qid/reject', async (c) => {
    try {
        const response = await rejectQuestion(requestWorkingDir(c), c.req.param('qid'))
        return c.json(response satisfies ChatOkResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatMessages.get('/api/chat/sessions/:id/messages', async (c) => {
    try {
        const query = parseMessagesQuery(c)
        const result = await listStudioSessionMessages(
            requestWorkingDir(c),
            c.req.param('id'),
            query,
        )
        return c.json(result satisfies ChatSessionMessagesResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

chatMessages.get('/api/chat/sessions/:id/diff', async (c) => {
    try {
        const response: ChatSessionDiffResponse = {
            diffs: await listStudioSessionDiff(requestWorkingDir(c), c.req.param('id')),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

/**
 * Resolve a session ID to its owner info (chatKey / agentId).
 * Used by the frontend to lazily register sessions created externally
 * (e.g., by wake cascade) into the sessionMap.
 */
chatMessages.get('/api/chat/sessions/:id/resolve', async (c) => {
    const context = await resolveSessionOwnership(c.req.param('id'))
    if (!context) {
        const response: ChatSessionResolveResponse = { found: false }
        return c.json(response)
    }
    const response: ChatSessionResolveResponse = {
        found: true,
        sessionId: context.sessionId,
        ownerId: context.ownerId,
        ownerKind: context.ownerKind,
    }
    return c.json(response)
})

export default chatMessages
