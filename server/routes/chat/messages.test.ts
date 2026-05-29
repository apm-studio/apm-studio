import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveSessionOwnershipMock = vi.fn()
const listStudioSessionMessagesMock = vi.fn()
const listStudioSessionDiffMock = vi.fn()

vi.mock('../../services/chat/session-ownership-service.js', () => ({
    resolveSessionOwnership: resolveSessionOwnershipMock,
}))

vi.mock('../../services/chat/message-service.js', () => ({
    sendStudioChatMessage: vi.fn(),
}))

vi.mock('../../services/chat/session-service.js', () => ({
    listStudioSessionDiff: listStudioSessionDiffMock,
    listStudioSessionMessages: listStudioSessionMessagesMock,
    rejectQuestion: vi.fn(),
    respondQuestion: vi.fn(),
}))

describe('chat messages resolve route', () => {
    beforeEach(() => {
        resolveSessionOwnershipMock.mockReset()
        listStudioSessionMessagesMock.mockReset()
        listStudioSessionDiffMock.mockReset()
    })

    it('returns session messages through the shared body contract', async () => {
        listStudioSessionMessagesMock.mockResolvedValueOnce({
            messages: [{ id: 'msg-1', role: 'user', parts: [{ id: 'part-1', type: 'text', text: 'Hello' }] }],
            nextCursor: 'cursor-2',
        })
        const { default: chatMessages } = await import('./messages.js')

        const res = await chatMessages.request(
            'http://studio.local/api/chat/sessions/ses_known/messages?workingDir=%2Ftmp%2Fworkspace&limit=25&before=cursor-1',
        )
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({
            messages: [{ id: 'msg-1', role: 'user', parts: [{ id: 'part-1', type: 'text', text: 'Hello' }] }],
            nextCursor: 'cursor-2',
        })
        expect(res.headers.get('x-next-cursor')).toBeNull()
        expect(listStudioSessionMessagesMock).toHaveBeenCalledWith(
            '/tmp/workspace',
            'ses_known',
            { limit: 25, before: 'cursor-1' },
        )
    })

    it('wraps session diffs in the shared response contract', async () => {
        listStudioSessionDiffMock.mockResolvedValueOnce([
            {
                file: 'src/App.tsx',
                before: 'old',
                after: 'new',
                additions: 2,
                deletions: 1,
                status: 'modified',
            },
        ])
        const { default: chatMessages } = await import('./messages.js')

        const res = await chatMessages.request(
            'http://studio.local/api/chat/sessions/ses_known/diff?workingDir=%2Ftmp%2Fworkspace',
        )
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({
            diffs: [{
                file: 'src/App.tsx',
                before: 'old',
                after: 'new',
                additions: 2,
                deletions: 1,
                status: 'modified',
            }],
        })
        expect(listStudioSessionDiffMock).toHaveBeenCalledWith('/tmp/workspace', 'ses_known')
    })

    it('returns a quiet miss for unresolved session ownership', async () => {
        resolveSessionOwnershipMock.mockResolvedValueOnce(null)
        const { default: chatMessages } = await import('./messages.js')

        const res = await chatMessages.request('http://studio.local/api/chat/sessions/ses_missing/resolve')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({ found: false })
        expect(resolveSessionOwnershipMock).toHaveBeenCalledWith('ses_missing')
    })

    it('returns owner metadata for resolved session ownership', async () => {
        resolveSessionOwnershipMock.mockResolvedValueOnce({
            sessionId: 'ses_known',
            ownerKind: 'team',
            ownerId: 'team:review:thread:main:participant:lead',
            workingDir: '/tmp/workspace',
            updatedAt: 1,
        })
        const { default: chatMessages } = await import('./messages.js')

        const res = await chatMessages.request('http://studio.local/api/chat/sessions/ses_known/resolve')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({
            found: true,
            sessionId: 'ses_known',
            ownerKind: 'team',
            ownerId: 'team:review:thread:main:participant:lead',
        })
    })
})
