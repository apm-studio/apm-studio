import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionListMock = vi.fn()
const sessionMessagesMock = vi.fn()
const readStoredProviderAuthMock = vi.fn()

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        session: {
            list: sessionListMock,
            messages: sessionMessagesMock,
        },
    }),
}))

vi.mock('../../lib/opencode-auth.js', () => ({
    readStoredProviderAuth: readStoredProviderAuthMock,
}))

function messagesPage(data: ReadonlyArray<unknown>, nextCursor: string | null = null) {
    return {
        data,
        response: {
            headers: {
                get: (name: string) => name.toLowerCase() === 'x-next-cursor' ? nextCursor : null,
            },
        },
    }
}

describe('usage route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        readStoredProviderAuthMock.mockResolvedValue(null)
        sessionListMock.mockResolvedValue({ data: [] })
        sessionMessagesMock.mockResolvedValue(messagesPage([]))
    })

    it('aggregates Studio usage across paginated OpenCode messages', async () => {
        sessionListMock.mockResolvedValue({
            data: [{ id: 'session-1' }],
        })
        sessionMessagesMock
            .mockResolvedValueOnce(messagesPage([
                {
                    parts: [
                        {
                            cost: 0.1,
                            tokens: {
                                input: 10,
                                output: 20,
                                reasoning: 3,
                            },
                        },
                    ],
                },
            ], 'cursor-2'))
            .mockResolvedValueOnce(messagesPage([
                {
                    parts: [
                        {
                            cost: 0.2,
                            tokens: {
                                input: 30,
                                output: 40,
                                reasoning: 7,
                            },
                        },
                    ],
                },
            ]))

        const { default: usage } = await import('./usage.js')
        const res = await usage.request('http://studio.local/api/usage?workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json() as {
            studio: {
                totalCostUsd: number
                inputTokens: number
                outputTokens: number
                reasoningTokens: number
            }
            codex: {
                connected: boolean
                authType: string | null
            }
        }

        expect(res.status).toBe(200)
        expect(body.studio).toEqual({
            totalCostUsd: 0.3,
            inputTokens: 40,
            outputTokens: 60,
            reasoningTokens: 10,
        })
        expect(body.codex).toEqual({
            connected: false,
            authType: null,
        })
        expect(sessionMessagesMock).toHaveBeenNthCalledWith(1, {
            directory: '/tmp/workspace',
            sessionID: 'session-1',
            limit: 100,
        })
        expect(sessionMessagesMock).toHaveBeenNthCalledWith(2, {
            directory: '/tmp/workspace',
            sessionID: 'session-1',
            limit: 100,
            before: 'cursor-2',
        })
    })
})
