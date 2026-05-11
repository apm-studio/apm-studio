import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const globalEventMock = vi.fn()
const replyPermissionMock = vi.fn()
const resolveSessionOwnershipMock = vi.fn()

vi.mock('../lib/opencode.js', () => ({
    getOpencode: async () => ({
        global: {
            event: globalEventMock,
        },
        permission: {
            reply: replyPermissionMock,
        },
    }),
}))

vi.mock('./session-ownership-service.js', () => ({
    resolveSessionOwnership: resolveSessionOwnershipMock,
}))

type SubscribeOptions = {
    signal: AbortSignal
    sseMaxRetryAttempts?: number
}

function blockingStream(signal: AbortSignal): AsyncIterable<never> {
    return {
        [Symbol.asyncIterator]() {
            return {
                async next() {
                    if (signal.aborted) {
                        return { done: true, value: undefined }
                    }
                    await new Promise<void>((resolve) => {
                        signal.addEventListener('abort', () => resolve(), { once: true })
                    })
                    return { done: true, value: undefined }
                },
                async return() {
                    return { done: true, value: undefined }
                },
            }
        },
    }
}

function completedStream(): AsyncIterable<never> {
    return {
        [Symbol.asyncIterator]() {
            return {
                async next() {
                    return { done: true, value: undefined }
                },
            }
        },
    }
}

function eventStream(events: unknown[]): AsyncIterable<unknown> {
    return {
        [Symbol.asyncIterator]() {
            let index = 0
            return {
                async next() {
                    if (index >= events.length) {
                        return { done: true, value: undefined }
                    }
                    return { done: false, value: events[index++] }
                },
            }
        },
    }
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readSseMessage(stream: ReadableStream) {
    const reader = stream.getReader()
    const result = await reader.read()
    reader.releaseLock()
    if (result.done) {
        return null
    }
    return new TextDecoder().decode(result.value)
}

describe('buildStudioChatEventStream', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.useRealTimers()
        globalEventMock.mockReset()
        replyPermissionMock.mockReset()
        resolveSessionOwnershipMock.mockReset().mockResolvedValue(null)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.clearAllMocks()
    })

    it('subscribes to OpenCode events with an isolated abort signal', async () => {
        const subscribeOptions: SubscribeOptions[] = []
        globalEventMock.mockImplementation(async (options: SubscribeOptions) => {
            subscribeOptions.push(options)
            return { stream: blockingStream(options.signal) }
        })

        const requestController = new AbortController()
        const { buildStudioChatEventStream } = await import('./chat-event-stream-service.js')

        const stream = await buildStudioChatEventStream('/tmp/studio-workspace', requestController.signal)

        await vi.waitFor(() => expect(globalEventMock).toHaveBeenCalledTimes(1))

        expect(subscribeOptions[0]?.signal).toBeInstanceOf(AbortSignal)
        expect(subscribeOptions[0]?.signal).not.toBe(requestController.signal)
        expect(subscribeOptions[0]?.signal.aborted).toBe(false)
        expect(subscribeOptions[0]?.sseMaxRetryAttempts).toBe(1)

        await stream.cancel()

        expect(subscribeOptions[0]?.signal.aborted).toBe(true)
    })

    it('aborts active OpenCode subscriptions when the request aborts', async () => {
        const subscribeOptions: SubscribeOptions[] = []
        globalEventMock.mockImplementation(async (options: SubscribeOptions) => {
            subscribeOptions.push(options)
            return { stream: blockingStream(options.signal) }
        })

        const requestController = new AbortController()
        const { buildStudioChatEventStream } = await import('./chat-event-stream-service.js')

        const stream = await buildStudioChatEventStream('/tmp/studio-workspace', requestController.signal)

        await vi.waitFor(() => expect(globalEventMock).toHaveBeenCalledTimes(1))

        requestController.abort()

        await vi.waitFor(() => expect(subscribeOptions[0]?.signal.aborted).toBe(true))
        await stream.cancel().catch(() => {})
    })

    it('does not start an OpenCode subscription for an already-aborted request', async () => {
        const requestController = new AbortController()
        requestController.abort()

        const { buildStudioChatEventStream } = await import('./chat-event-stream-service.js')

        const stream = await buildStudioChatEventStream('/tmp/studio-workspace', requestController.signal)

        await wait(25)

        expect(globalEventMock).not.toHaveBeenCalled()

        await stream.cancel().catch(() => {})
    })

    it('waits for the refresh loop instead of recursively reconnecting completed subscriptions', async () => {
        globalEventMock.mockResolvedValue({ stream: completedStream() })

        const { buildStudioChatEventStream } = await import('./chat-event-stream-service.js')
        const stream = await buildStudioChatEventStream('/tmp/studio-workspace')

        await vi.waitFor(() => expect(globalEventMock).toHaveBeenCalledTimes(1))
        await wait(25)

        expect(globalEventMock).toHaveBeenCalledTimes(1)

        await stream.cancel()
    })

    it('forwards global OpenCode events only for the requested working directory', async () => {
        globalEventMock.mockResolvedValue({
            stream: eventStream([
                {
                    directory: '/tmp/other-workspace',
                    payload: {
                        type: 'permission.asked',
                        properties: {
                            id: 'ignored-permission',
                            sessionID: 'ignored-session',
                        },
                    },
                },
                {
                    directory: '/tmp/studio-workspace',
                    payload: {
                        type: 'permission.asked',
                        properties: {
                            id: 'permission-1',
                            sessionID: 'session-1',
                            permission: 'webfetch',
                            patterns: ['https://example.com'],
                            always: [],
                            metadata: {},
                        },
                    },
                },
            ]),
        })

        const { buildStudioChatEventStream } = await import('./chat-event-stream-service.js')
        const stream = await buildStudioChatEventStream('/tmp/studio-workspace')

        const message = await readSseMessage(stream)

        expect(message).toContain('permission.asked')
        expect(message).toContain('permission-1')
        expect(message).not.toContain('ignored-permission')

        await stream.cancel()
    })

    it('auto-accepts Act permissions through the current OpenCode permission reply API', async () => {
        resolveSessionOwnershipMock.mockResolvedValue({
            sessionId: 'session-1',
            ownerKind: 'act',
            ownerId: 'act:act-1:thread:thread-1:participant:participant-1',
            workingDir: '/tmp/studio-workspace',
        })
        globalEventMock.mockResolvedValue({
            stream: eventStream([
                {
                    directory: '/tmp/studio-workspace',
                    payload: {
                        type: 'permission.asked',
                        properties: {
                            id: 'permission-1',
                            sessionID: 'session-1',
                            permission: 'bash',
                            patterns: ['npm test'],
                            always: [],
                            metadata: {},
                        },
                    },
                },
            ]),
        })

        const { buildStudioChatEventStream } = await import('./chat-event-stream-service.js')
        const stream = await buildStudioChatEventStream('/tmp/studio-workspace')

        await vi.waitFor(() => {
            expect(replyPermissionMock).toHaveBeenCalledWith({
                requestID: 'permission-1',
                reply: 'always',
                directory: '/tmp/studio-workspace',
            })
        })

        await stream.cancel()
    })
})
