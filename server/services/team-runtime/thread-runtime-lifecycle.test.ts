import { describe, expect, it } from 'vitest'

import {
    collectRuntimeSessionIds,
    createThreadRuntime,
    deletedRuntimeResult,
    isActiveThreadStatus,
    listThreadRuntimeIds,
    listThreadRuntimeSummaries,
} from './thread-runtime-lifecycle.js'

function runtime(teamId: string, threadId: string) {
    return createThreadRuntime({
        workspaceId: 'workspace-1',
        teamId,
        threadId,
        createdAt: 100,
    })
}

describe('thread runtime lifecycle helpers', () => {
    it('creates active thread runtimes with empty mailbox and participant state', () => {
        const created = runtime('team-1', 'thread-1')

        expect(created.thread).toEqual(expect.objectContaining({
            id: 'thread-1',
            teamId: 'team-1',
            status: 'active',
            createdAt: 100,
            participantSessions: {},
            participantStatuses: {},
        }))
        expect(created.thread.mailbox).toEqual({
            pendingMessages: [],
            board: {},
            wakeConditions: [],
        })
        expect(created.retiredParticipantSessions).toEqual({})
    })

    it('collects current and retired participant sessions once', () => {
        const created = runtime('team-1', 'thread-1')
        created.thread.participantSessions = {
            Lead: 'session-1',
            Researcher: 'session-2',
        }
        created.retiredParticipantSessions = {
            Lead: ['session-1', 'session-old'],
        }

        expect(collectRuntimeSessionIds(created)).toEqual(['session-1', 'session-2', 'session-old'])
        expect(deletedRuntimeResult(created)).toEqual({
            deleted: true,
            teamId: 'team-1',
            sessionIds: ['session-1', 'session-2', 'session-old'],
        })
        expect(deletedRuntimeResult(null)).toEqual({
            deleted: false,
            teamId: null,
            sessionIds: [],
        })
    })

    it('filters thread ids and summaries by team and status', () => {
        const first = runtime('team-1', 'thread-1')
        const second = runtime('team-1', 'thread-2')
        const third = runtime('team-2', 'thread-3')
        second.thread.status = 'completed'

        expect(isActiveThreadStatus('active')).toBe(true)
        expect(isActiveThreadStatus('idle')).toBe(true)
        expect(isActiveThreadStatus('completed')).toBe(false)
        expect(listThreadRuntimeIds([first, second, third], 'team-1', ['active'])).toEqual(['thread-1'])
        expect(listThreadRuntimeSummaries([first, second, third], 'team-1')).toEqual([
            expect.objectContaining({ id: 'thread-1', teamId: 'team-1', status: 'active' }),
            expect.objectContaining({ id: 'thread-2', teamId: 'team-1', status: 'completed' }),
        ])
    })
})
