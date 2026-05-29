import { beforeEach, describe, expect, it, vi } from 'vitest'

const listStudioSessionTodosMock = vi.fn()
const listStudioChatSessionsMock = vi.fn()
const listPendingPermissionsMock = vi.fn()
const listPendingQuestionsMock = vi.fn()
const revertStudioChatSessionMock = vi.fn()
const summarizeStudioChatSessionMock = vi.fn()
const unrevertStudioChatSessionMock = vi.fn()

vi.mock('../../services/chat/session-service.js', () => ({
    abortStudioChatSession: vi.fn(),
    deleteStudioChatSession: vi.fn(),
    getStudioChatSessionStatus: vi.fn(),
    listPendingPermissions: listPendingPermissionsMock,
    listPendingQuestions: listPendingQuestionsMock,
    listStudioChatSessions: listStudioChatSessionsMock,
    listStudioSessionTodos: listStudioSessionTodosMock,
    renameStudioChatSession: vi.fn(),
    respondSessionPermission: vi.fn(),
    revertStudioChatSession: revertStudioChatSessionMock,
    summarizeStudioChatSession: summarizeStudioChatSessionMock,
    unrevertStudioChatSession: unrevertStudioChatSessionMock,
}))

vi.mock('../../services/chat/message-service.js', () => ({
    createStudioChatSession: vi.fn(),
}))

describe('chat session routes', () => {
    beforeEach(() => {
        listStudioSessionTodosMock.mockReset()
        listStudioChatSessionsMock.mockReset()
        listPendingPermissionsMock.mockReset()
        listPendingQuestionsMock.mockReset()
        revertStudioChatSessionMock.mockReset()
        summarizeStudioChatSessionMock.mockReset()
        unrevertStudioChatSessionMock.mockReset()
    })

    it('wraps session summaries in the shared list response contract', async () => {
        listStudioChatSessionsMock.mockResolvedValueOnce([{ id: 'session-1', title: 'Review' }])
        const { default: chatSessions } = await import('./sessions.js')

        const res = await chatSessions.request('http://studio.local/api/chat/sessions?workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({ sessions: [{ id: 'session-1', title: 'Review' }] })
        expect(listStudioChatSessionsMock).toHaveBeenCalledWith('/tmp/workspace')
    })

    it('wraps session todos in the shared response contract', async () => {
        listStudioSessionTodosMock.mockResolvedValueOnce([{ id: 'todo-1', content: 'Review' }])
        const { default: chatSessions } = await import('./sessions.js')

        const res = await chatSessions.request('http://studio.local/api/chat/sessions/session-1/todos?workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({ todos: [{ id: 'todo-1', content: 'Review' }] })
        expect(listStudioSessionTodosMock).toHaveBeenCalledWith('/tmp/workspace', 'session-1')
    })

    it('wraps pending interaction lists in shared response contracts', async () => {
        listPendingPermissionsMock.mockResolvedValueOnce([{
            id: 'permission-1',
            sessionId: 'session-1',
            permission: 'bash',
            patterns: [],
            always: [],
            metadata: {},
        }])
        listPendingQuestionsMock.mockResolvedValueOnce([{
            id: 'question-1',
            sessionId: 'session-1',
            questions: [{ header: 'Scope', question: 'Which scope?', options: [] }],
        }])
        const { default: chatSessions } = await import('./sessions.js')

        const permissionsRes = await chatSessions.request('http://studio.local/api/chat/permissions?workingDir=%2Ftmp%2Fworkspace')
        const questionsRes = await chatSessions.request('http://studio.local/api/chat/questions?workingDir=%2Ftmp%2Fworkspace')

        expect(await permissionsRes.json()).toEqual({
            permissions: [{
                id: 'permission-1',
                sessionId: 'session-1',
                permission: 'bash',
                patterns: [],
                always: [],
                metadata: {},
            }],
        })
        expect(await questionsRes.json()).toEqual({
            questions: [{
                id: 'question-1',
                sessionId: 'session-1',
                questions: [{ header: 'Scope', question: 'Which scope?', options: [] }],
            }],
        })
    })

    it('returns summarize results through a named response contract', async () => {
        summarizeStudioChatSessionMock.mockResolvedValueOnce({ ok: true, summarized: true })
        const { default: chatSessions } = await import('./sessions.js')

        const res = await chatSessions.request('http://studio.local/api/chat/sessions/session-1/summarize?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ providerId: 'openai', modelId: 'gpt-5-mini' }),
        })

        expect(await res.json()).toEqual({ ok: true, summarized: true })
        expect(summarizeStudioChatSessionMock).toHaveBeenCalledWith('/tmp/workspace', 'session-1', {
            providerId: 'openai',
            modelId: 'gpt-5-mini',
            auto: undefined,
        })
    })

    it('returns revert and unrevert results through named response contracts', async () => {
        revertStudioChatSessionMock.mockResolvedValueOnce({
            ok: true,
            revert: { messageId: 'message-1', partId: 'part-1' },
        })
        unrevertStudioChatSessionMock.mockResolvedValueOnce({ ok: true })
        const { default: chatSessions } = await import('./sessions.js')

        const revertRes = await chatSessions.request('http://studio.local/api/chat/sessions/session-1/revert?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ messageId: 'message-1', partId: 'part-1' }),
        })
        const unrevertRes = await chatSessions.request('http://studio.local/api/chat/sessions/session-1/unrevert?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
        })

        expect(await revertRes.json()).toEqual({
            ok: true,
            revert: { messageId: 'message-1', partId: 'part-1' },
        })
        expect(await unrevertRes.json()).toEqual({ ok: true })
        expect(revertStudioChatSessionMock).toHaveBeenCalledWith('/tmp/workspace', 'session-1', {
            messageId: 'message-1',
            partId: 'part-1',
        })
        expect(unrevertStudioChatSessionMock).toHaveBeenCalledWith('/tmp/workspace', 'session-1')
    })
})
