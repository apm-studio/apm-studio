import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionSupervisor } from './session-recovery'

const { statusMock } = vi.hoisted(() => ({
    statusMock: vi.fn(),
}))

vi.mock('../../api-clients/chat', () => ({
    chatApi: {
        status: statusMock,
    },
}))

describe('createSessionSupervisor', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('clears optimistic loading when the server derives an idle session state', async () => {
        const syncSessionMessages = vi.fn().mockResolvedValue({ messages: [] })
        const setSessionStatus = vi.fn()
        const setSessionLoading = vi.fn()
        const state: {
            sessionLoading: Record<string, boolean>
            chatKeyToSession: Record<string, string>
            sessionToChatKey: Record<string, string>
        } = {
            sessionLoading: { 'session-1': true },
            chatKeyToSession: { 'agent-1': 'session-1' },
            sessionToChatKey: { 'session-1': 'agent-1' },
        }
        const get = () => state

        statusMock.mockResolvedValue({
            status: { type: 'idle' },
        })

        const supervisor = createSessionSupervisor({
            get: get as never,
            syncSessionMessages,
            setSessionStatus,
            setSessionLoading: (sessionId, loading) => {
                setSessionLoading(sessionId, loading)
                if (!loading) {
                    delete state.sessionLoading[sessionId]
                }
            },
        })

        supervisor.schedule('agent-1', 'session-1')

        await vi.advanceTimersByTimeAsync(1_200)
        await Promise.resolve()

        expect(statusMock).toHaveBeenCalledWith('session-1')
        expect(setSessionStatus).toHaveBeenCalledWith('session-1', { type: 'idle' })
        expect(setSessionLoading).toHaveBeenCalledWith('session-1', false)
        expect(syncSessionMessages).toHaveBeenCalledWith('agent-1', 'session-1')
        expect(supervisor.isRunning('session-1')).toBe(false)
    })
})
