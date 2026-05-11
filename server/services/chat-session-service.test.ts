import { beforeEach, describe, expect, it, vi } from 'vitest'

const statusMock = vi.fn()
const messagesMock = vi.fn()
const todoMock = vi.fn()
const permissionListMock = vi.fn()
const permissionReplyMock = vi.fn()
const deprecatedPermissionRespondMock = vi.fn()
const questionListMock = vi.fn()
const questionReplyMock = vi.fn()
const questionRejectMock = vi.fn()
const listOwnershipsMock = vi.fn()

vi.mock('../lib/opencode.js', () => ({
    getOpencode: async () => ({
        session: {
            status: statusMock,
            messages: messagesMock,
            todo: todoMock,
        },
        permission: {
            list: permissionListMock,
            reply: permissionReplyMock,
            respond: deprecatedPermissionRespondMock,
        },
        question: {
            list: questionListMock,
            reply: questionReplyMock,
            reject: questionRejectMock,
        },
    }),
}))

vi.mock('./session-ownership-service.js', () => ({
    deleteSessionOwnership: vi.fn(),
    listSessionOwnershipsForWorkingDir: listOwnershipsMock,
    resolveSessionOwnership: vi.fn(),
    setSessionSidebarTitle: vi.fn(),
}))

describe('getStudioChatSessionStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        statusMock.mockResolvedValue({ data: {} })
        messagesMock.mockResolvedValue({ data: [] })
        todoMock.mockResolvedValue({ data: [] })
        permissionListMock.mockResolvedValue({ data: [] })
        permissionReplyMock.mockResolvedValue({ data: true })
        deprecatedPermissionRespondMock.mockResolvedValue({ data: true })
        questionListMock.mockResolvedValue({ data: [] })
        questionReplyMock.mockResolvedValue({ data: true })
        questionRejectMock.mockResolvedValue({ data: true })
        listOwnershipsMock.mockResolvedValue([])
    })

    it('derives idle when OpenCode status is missing but a completed assistant message exists', async () => {
        statusMock.mockResolvedValueOnce({ data: {} })
        messagesMock.mockResolvedValueOnce({
            data: [
                {
                    info: {
                        role: 'assistant',
                        time: { completed: 123 },
                    },
                    parts: [
                        { type: 'text', text: 'Done.' },
                    ],
                },
            ],
        })

        const { getStudioChatSessionStatus } = await import('./chat-session-service.js')
        await expect(getStudioChatSessionStatus('/tmp/workspace', 'session-1')).resolves.toEqual({
            status: { type: 'idle' },
        })
    })

    it('downgrades stale busy status to idle when the latest assistant turn already settled', async () => {
        statusMock.mockResolvedValueOnce({
            data: {
                'session-1': { type: 'busy' },
            },
        })
        messagesMock.mockResolvedValueOnce({
            data: [
                {
                    info: {
                        role: 'assistant',
                        time: { completed: 123 },
                    },
                    parts: [
                        { type: 'text', text: 'Done.' },
                    ],
                },
            ],
        })

        const { getStudioChatSessionStatus } = await import('./chat-session-service.js')
        await expect(getStudioChatSessionStatus('/tmp/workspace', 'session-1')).resolves.toEqual({
            status: { type: 'idle' },
        })
    })

    it('keeps busy status when the latest assistant turn is still running', async () => {
        statusMock.mockResolvedValueOnce({
            data: {
                'session-1': { type: 'busy' },
            },
        })
        messagesMock.mockResolvedValueOnce({
            data: [
                {
                    info: {
                        role: 'assistant',
                    },
                    parts: [
                        {
                            type: 'tool',
                            state: {
                                status: 'running',
                            },
                        },
                    ],
                },
            ],
        })

        const { getStudioChatSessionStatus } = await import('./chat-session-service.js')
        await expect(getStudioChatSessionStatus('/tmp/workspace', 'session-1')).resolves.toEqual({
            status: { type: 'busy' },
        })
    })
})

describe('OpenCode permission, question, and todo integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        statusMock.mockResolvedValue({ data: {} })
        messagesMock.mockResolvedValue({ data: [] })
        todoMock.mockResolvedValue({ data: [] })
        permissionListMock.mockResolvedValue({ data: [] })
        permissionReplyMock.mockResolvedValue({ data: true })
        deprecatedPermissionRespondMock.mockResolvedValue({ data: true })
        questionListMock.mockResolvedValue({ data: [] })
        questionReplyMock.mockResolvedValue({ data: true })
        questionRejectMock.mockResolvedValue({ data: true })
        listOwnershipsMock.mockResolvedValue([])
    })

    it('responds to permissions through the current OpenCode permission reply API', async () => {
        const { respondSessionPermission } = await import('./chat-session-service.js')

        await expect(respondSessionPermission('/tmp/workspace', 'session-1', 'permission-1', 'once')).resolves.toEqual({ ok: true })

        expect(permissionReplyMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            requestID: 'permission-1',
            reply: 'once',
        })
        expect(deprecatedPermissionRespondMock).not.toHaveBeenCalled()
    })

    it('filters pending permissions and questions to sessions owned by the requested working directory', async () => {
        listOwnershipsMock.mockResolvedValue([
            { sessionId: 'session-keep', workingDir: '/tmp/workspace' },
        ])
        permissionListMock.mockResolvedValue({
            data: [
                { id: 'permission-1', sessionID: 'session-keep', metadata: {} },
                { id: 'permission-2', sessionID: 'session-drop', metadata: {} },
            ],
        })
        questionListMock.mockResolvedValue({
            data: [
                { id: 'question-1', sessionID: 'session-keep' },
                { id: 'question-2', sessionID: 'session-drop' },
            ],
        })

        const { listPendingPermissions, listPendingQuestions } = await import('./chat-session-service.js')

        await expect(listPendingPermissions('/tmp/workspace')).resolves.toEqual([
            { id: 'permission-1', sessionID: 'session-keep', metadata: {} },
        ])
        await expect(listPendingQuestions('/tmp/workspace')).resolves.toEqual([
            { id: 'question-1', sessionID: 'session-keep' },
        ])
    })

    it('passes working directory when replying to or rejecting questions', async () => {
        const { respondQuestion, rejectQuestion } = await import('./chat-session-service.js')

        await respondQuestion('/tmp/workspace', 'question-1', [])
        await rejectQuestion('/tmp/workspace', 'question-2')

        expect(questionReplyMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            requestID: 'question-1',
            answers: [],
        })
        expect(questionRejectMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            requestID: 'question-2',
        })
    })

    it('returns session todos from OpenCode', async () => {
        todoMock.mockResolvedValue({
            data: [
                { id: 'todo-1', content: 'Fix bug' },
            ],
        })

        const { listStudioSessionTodos } = await import('./chat-session-service.js')

        await expect(listStudioSessionTodos('/tmp/workspace', 'session-1')).resolves.toEqual([
            { id: 'todo-1', content: 'Fix bug' },
        ])
        expect(todoMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            sessionID: 'session-1',
        })
    })
})
