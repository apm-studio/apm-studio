import { beforeEach, describe, expect, it, vi } from 'vitest'

const parseTeamSessionOwnershipOwnerId = vi.fn()
const resolveSessionOwnership = vi.fn()
const registerParticipantSession = vi.fn()
const setParticipantSessionStatus = vi.fn()

vi.mock('../chat/session-ownership-service.js', () => ({
    parseTeamSessionOwnershipOwnerId,
    resolveSessionOwnership,
}))

vi.mock('./team-runtime-service.js', () => ({
    getTeamRuntimeService: vi.fn(() => ({
        registerParticipantSession,
        setParticipantSessionStatus,
    })),
}))

describe('team-session-runtime', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        parseTeamSessionOwnershipOwnerId.mockReturnValue({
            teamId: 'team-1',
            threadId: 'thread-1',
            participantKey: 'participant-1',
        })
    })

    it('registers participant sessions from the canonical team owner id', async () => {
        const { registerTeamParticipantSession } = await import('./team-session-runtime.js')

        await expect(registerTeamParticipantSession(
            '/tmp/workspace',
            'team:team-1:thread:thread-1:participant:participant-1',
            'session-1',
        )).resolves.toBe(true)

        expect(parseTeamSessionOwnershipOwnerId).toHaveBeenCalledWith(
            'team:team-1:thread:thread-1:participant:participant-1',
        )
        expect(registerParticipantSession).toHaveBeenCalledWith('thread-1', 'participant-1', 'session-1')
    })

    it('resolves and syncs team participant status from session ownership', async () => {
        resolveSessionOwnership.mockResolvedValue({
            ownerKind: 'team',
            ownerId: 'team:team-1:thread:thread-1:participant:participant-1',
            workingDir: '/tmp/workspace',
        })

        const {
            resolveTeamSessionTarget,
            syncTeamParticipantStatusForSession,
        } = await import('./team-session-runtime.js')

        await expect(resolveTeamSessionTarget('session-1')).resolves.toEqual({
            sessionId: 'session-1',
            ownerId: 'team:team-1:thread:thread-1:participant:participant-1',
            workingDir: '/tmp/workspace',
            teamId: 'team-1',
            threadId: 'thread-1',
            participantKey: 'participant-1',
        })

        await expect(syncTeamParticipantStatusForSession('session-1', {
            type: 'idle',
        })).resolves.toBe(true)

        expect(registerParticipantSession).toHaveBeenCalledWith('thread-1', 'participant-1', 'session-1')
        expect(setParticipantSessionStatus).toHaveBeenCalledWith('thread-1', 'participant-1', {
            type: 'idle',
        })
    })
})
