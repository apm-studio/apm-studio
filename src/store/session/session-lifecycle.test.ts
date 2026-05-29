import { describe, expect, it } from 'vitest'
import type { StudioState } from '../types'
import {
    collectTeamSessionTargets,
    collectTeamThreadSessionTargets,
    collectAgentSessionTargets,
} from './session-lifecycle'

describe('session lifecycle cleanup target collection', () => {
    it('collects every participant session under a Team', () => {
        const state = {
            teamThreads: {
                'team-1': [{
                    id: 'thread-3',
                    participantSessions: { gamma: 'session-3' },
                }],
            },
            chatKeyToSession: {
                'team:team-1:thread:thread-1:participant:alpha': 'session-1',
                'team:team-1:thread:thread-2:participant:beta': 'session-2',
                'team:team-2:thread:thread-1:participant:alpha': 'session-4',
                'agent-1': 'session-5',
            },
        } as unknown as StudioState

        expect(collectTeamSessionTargets(state, 'team-1')).toEqual([
            { chatKey: 'team:team-1:thread:thread-1:participant:alpha', sessionId: 'session-1' },
            { chatKey: 'team:team-1:thread:thread-2:participant:beta', sessionId: 'session-2' },
            { chatKey: 'team:team-1:thread:thread-3:participant:gamma', sessionId: 'session-3' },
        ])
    })

    it('collects only participant sessions for the deleted thread', () => {
        const state = {
            teamThreads: {
                'team-1': [{
                    id: 'thread-1',
                    participantSessions: { beta: 'session-beta' },
                }],
            },
            chatKeyToSession: {
                'team:team-1:thread:thread-1:participant:alpha': 'session-1',
                'team:team-1:thread:thread-2:participant:alpha': 'session-2',
            },
        } as unknown as StudioState

        expect(collectTeamThreadSessionTargets(state, 'team-1', 'thread-1')).toEqual([
            { chatKey: 'team:team-1:thread:thread-1:participant:alpha', sessionId: 'session-1' },
            { chatKey: 'team:team-1:thread:thread-1:participant:beta', sessionId: 'session-beta' },
        ])
    })

    it('collects a agent direct session and its Team participant sessions', () => {
        const state = {
            teams: [{
                id: 'team-1',
                name: 'Team',
                position: { x: 0, y: 0 },
                width: 400,
                height: 300,
                participants: {
                    alpha: {
                        agentRef: { kind: 'draft', draftId: 'agent-1' },
                        position: { x: 0, y: 0 },
                    },
                    beta: {
                        agentRef: { kind: 'draft', draftId: 'agent-2' },
                        position: { x: 0, y: 0 },
                    },
                },
                relations: [],
                createdAt: 1,
            }],
            teamThreads: {
                'team-1': [{
                    id: 'thread-1',
                    participantSessions: {
                        alpha: 'session-alpha',
                        beta: 'session-beta',
                    },
                }],
            },
            chatKeyToSession: {
                'agent-1': 'session-agent',
                'team:team-1:thread:thread-1:participant:alpha': 'session-alpha',
                'team:team-1:thread:thread-1:participant:beta': 'session-beta',
            },
        } as unknown as StudioState

        expect(collectAgentSessionTargets(state, { id: 'agent-1' })).toEqual([
            { chatKey: 'agent-1', sessionId: 'session-agent' },
            { chatKey: 'team:team-1:thread:thread-1:participant:alpha', sessionId: 'session-alpha' },
        ])
    })
})
