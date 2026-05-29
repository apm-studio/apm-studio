import { beforeEach, describe, expect, it, vi } from 'vitest'

const statusMock = vi.fn()
const messagesMock = vi.fn()
const todoMock = vi.fn()
const diffMock = vi.fn()
const revertMock = vi.fn()
const unrevertMock = vi.fn()
const permissionListMock = vi.fn()
const permissionReplyMock = vi.fn()
const questionListMock = vi.fn()
const questionReplyMock = vi.fn()
const questionRejectMock = vi.fn()
const listOwnershipsMock = vi.fn()

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        session: {
            status: statusMock,
            messages: messagesMock,
            todo: todoMock,
            diff: diffMock,
            revert: revertMock,
            unrevert: unrevertMock,
        },
        permission: {
            list: permissionListMock,
            reply: permissionReplyMock,
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
        diffMock.mockResolvedValue({ data: [] })
        revertMock.mockResolvedValue({ data: {} })
        unrevertMock.mockResolvedValue({ data: {} })
        permissionListMock.mockResolvedValue({ data: [] })
        permissionReplyMock.mockResolvedValue({ data: true })
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

        const { getStudioChatSessionStatus } = await import('./session-service.js')
        await expect(getStudioChatSessionStatus('/tmp/workspace', 'session-1')).resolves.toEqual({
            status: { type: 'idle' },
        })
    })

    it('keeps direct busy status while the latest assistant turn may continue', async () => {
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

        const { getStudioChatSessionStatus } = await import('./session-service.js')
        await expect(getStudioChatSessionStatus('/tmp/workspace', 'session-1')).resolves.toEqual({
            status: { type: 'busy' },
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

        const { getStudioChatSessionStatus } = await import('./session-service.js')
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
        diffMock.mockResolvedValue({ data: [] })
        revertMock.mockResolvedValue({ data: {} })
        unrevertMock.mockResolvedValue({ data: {} })
        permissionListMock.mockResolvedValue({ data: [] })
        permissionReplyMock.mockResolvedValue({ data: true })
        questionListMock.mockResolvedValue({ data: [] })
        questionReplyMock.mockResolvedValue({ data: true })
        questionRejectMock.mockResolvedValue({ data: true })
        listOwnershipsMock.mockResolvedValue([])
    })

    it('responds to permissions through the current OpenCode permission reply API', async () => {
        const { respondSessionPermission } = await import('./session-service.js')

        await expect(respondSessionPermission('/tmp/workspace', 'session-1', 'permission-1', 'once')).resolves.toEqual({ ok: true })

        expect(permissionReplyMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            requestID: 'permission-1',
            reply: 'once',
        })
    })

    it('filters pending permissions and questions to sessions owned by the requested working directory', async () => {
        listOwnershipsMock.mockResolvedValue([
            { sessionId: 'session-keep', workingDir: '/tmp/workspace' },
        ])
        permissionListMock.mockResolvedValue({
            data: [
                { id: 'permission-1', sessionID: 'session-keep', permission: 'bash', patterns: [], always: [], metadata: {} },
                { id: 'permission-2', sessionID: 'session-drop', permission: 'bash', patterns: [], always: [], metadata: {} },
            ],
        })
        questionListMock.mockResolvedValue({
            data: [
                { id: 'question-1', sessionID: 'session-keep', questions: [{ header: 'Scope', question: 'Which scope?', options: [] }] },
                { id: 'question-2', sessionID: 'session-drop', questions: [{ header: 'Scope', question: 'Which scope?', options: [] }] },
            ],
        })

        const { listPendingPermissions, listPendingQuestions } = await import('./session-service.js')

        await expect(listPendingPermissions('/tmp/workspace')).resolves.toEqual([
            { id: 'permission-1', sessionId: 'session-keep', permission: 'bash', patterns: [], always: [], metadata: {} },
        ])
        await expect(listPendingQuestions('/tmp/workspace')).resolves.toEqual([
            { id: 'question-1', sessionId: 'session-keep', questions: [{ header: 'Scope', question: 'Which scope?', options: [] }] },
        ])
    })

    it('passes working directory when replying to or rejecting questions', async () => {
        const { respondQuestion, rejectQuestion } = await import('./session-service.js')

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
                { content: 'Fix bug', status: 'pending', priority: 'medium' },
            ],
        })

        const { listStudioSessionTodos } = await import('./session-service.js')

        await expect(listStudioSessionTodos('/tmp/workspace', 'session-1')).resolves.toEqual([
            { content: 'Fix bug', status: 'pending', priority: 'medium' },
        ])
        expect(todoMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            sessionID: 'session-1',
        })
    })

    it('normalizes session messages before returning the Studio response body', async () => {
        messagesMock.mockResolvedValueOnce({
            data: [
                {
                    id: 'message-1',
                    role: 'assistant',
                    extra: 'ignored',
                    parts: [
                        { id: 'part-1', type: 'text', text: 'Hello', extra: 'ignored' },
                        { id: 'part-2', type: 'unknown', text: 'Ignored' },
                    ],
                },
            ],
        })
        statusMock.mockResolvedValueOnce({
            data: { 'session-1': { type: 'busy' } },
        })

        const { listStudioSessionMessages } = await import('./session-service.js')

        await expect(listStudioSessionMessages('/tmp/workspace', 'session-1')).resolves.toEqual({
            messages: [
                {
                    id: 'message-1',
                    role: 'assistant',
                    parts: [
                        { id: 'part-1', type: 'text', text: 'Hello' },
                    ],
                },
            ],
            nextCursor: null,
        })
    })

    it('normalizes session diffs to the Studio diff contract', async () => {
        diffMock.mockResolvedValueOnce({
            data: [
                {
                    post_name: 'src/example.ts',
                    diff: '@@ -1 +1 @@\n-old\n+new',
                    extra: 'ignored',
                },
            ],
        })

        const { listStudioSessionDiff } = await import('./session-service.js')

        await expect(listStudioSessionDiff('/tmp/workspace', 'session-1')).resolves.toEqual([
            {
                file: 'src/example.ts',
                before: '',
                after: '',
                additions: 1,
                deletions: 1,
                status: 'modified',
                rawDiff: '@@ -1 +1 @@\n-old\n+new',
            },
        ])
        expect(diffMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            sessionID: 'session-1',
        })
    })

    it('normalizes revert and unrevert responses to Studio contracts', async () => {
        revertMock.mockResolvedValueOnce({
            data: {
                revert: {
                    messageID: 'message-1',
                    partID: 'part-1',
                    extra: 'ignored',
                },
                extra: 'ignored',
            },
        })
        unrevertMock.mockResolvedValueOnce({ data: { extra: 'ignored' } })

        const { revertStudioChatSession, unrevertStudioChatSession } = await import('./session-service.js')

        await expect(revertStudioChatSession('/tmp/workspace', 'session-1', {
            messageId: 'message-1',
            partId: 'part-1',
        })).resolves.toEqual({
            ok: true,
            revert: {
                messageId: 'message-1',
                partId: 'part-1',
            },
        })
        await expect(unrevertStudioChatSession('/tmp/workspace', 'session-1')).resolves.toEqual({ ok: true })

        expect(revertMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            sessionID: 'session-1',
            messageID: 'message-1',
            partID: 'part-1',
        })
        expect(unrevertMock).toHaveBeenCalledWith({
            directory: '/tmp/workspace',
            sessionID: 'session-1',
        })
    })
})
