import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveSessionOwnershipMock = vi.fn()

vi.mock('../services/session-ownership-service.js', () => ({
    resolveSessionOwnership: resolveSessionOwnershipMock,
}))

vi.mock('../services/chat-service.js', () => ({
    sendStudioChatMessage: vi.fn(),
}))

vi.mock('../services/chat-session-service.js', () => ({
    listStudioSessionDiff: vi.fn(),
    listStudioSessionMessages: vi.fn(),
    rejectQuestion: vi.fn(),
    respondQuestion: vi.fn(),
}))

describe('chat messages resolve route', () => {
    beforeEach(() => {
        resolveSessionOwnershipMock.mockReset()
    })

    it('returns a quiet miss for unresolved session ownership', async () => {
        resolveSessionOwnershipMock.mockResolvedValueOnce(null)
        const { default: chatMessages } = await import('./chat-messages.js')

        const res = await chatMessages.request('http://studio.local/api/chat/sessions/ses_missing/resolve')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({ found: false })
        expect(resolveSessionOwnershipMock).toHaveBeenCalledWith('ses_missing')
    })

    it('returns owner metadata for resolved session ownership', async () => {
        resolveSessionOwnershipMock.mockResolvedValueOnce({
            sessionId: 'ses_known',
            ownerKind: 'act',
            ownerId: 'act:review:thread:main:participant:lead',
            workingDir: '/tmp/workspace',
            updatedAt: 1,
        })
        const { default: chatMessages } = await import('./chat-messages.js')

        const res = await chatMessages.request('http://studio.local/api/chat/sessions/ses_known/resolve')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({
            found: true,
            sessionId: 'ses_known',
            ownerKind: 'act',
            ownerId: 'act:review:thread:main:participant:lead',
        })
    })
})
