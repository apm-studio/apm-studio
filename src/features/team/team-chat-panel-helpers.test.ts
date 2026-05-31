import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { describe, expect, it } from 'vitest'
import {
    buildActiveTeamParticipantChatKey,
    buildTeamChatComposerState,
    buildTeamParticipantExecutionStates,
    buildTeamParticipantLoadingStates,
    moveParticipantKey,
    resolveActiveTeamParticipantKey,
    resolveTeamParticipantAgent,
} from './team-chat-panel-helpers'

const baseTeam: WorkspaceTeamSnapshot = {
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
            agentRef: { kind: 'registry', urn: 'agent://beta' },
            position: { x: 10, y: 10 },
        },
    },
    relations: [],
    createdAt: Date.now(),
}

const agents: WorkspaceAgentNode[] = [
    {
        id: 'agent-1',
        name: 'Alpha',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        instructionRef: null,
        skillRefs: [],
        mcpServerNames: [],
    },
    {
        id: 'agent-2',
        name: 'Beta',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        instructionRef: null,
        skillRefs: [],
        mcpServerNames: [],
        meta: {
            derivedFrom: 'agent://beta',
        },
    },
]

describe('team chat panel helpers', () => {
    it('moves participant keys for tab reordering without mutating invalid inputs', () => {
        const keys = ['alpha', 'beta', 'gamma']

        expect(moveParticipantKey(keys, 'gamma', 'alpha')).toEqual(['gamma', 'alpha', 'beta'])
        expect(moveParticipantKey(keys, 'alpha', 'gamma')).toEqual(['beta', 'gamma', 'alpha'])
        expect(moveParticipantKey(keys, 'missing', 'gamma')).toBe(keys)
        expect(moveParticipantKey(keys, 'alpha', 'alpha')).toBe(keys)
        expect(keys).toEqual(['alpha', 'beta', 'gamma'])
    })

    it('resolves the active participant unless the board is selected', () => {
        expect(resolveActiveTeamParticipantKey(['alpha', 'beta'], 'thread-1', 'beta')).toEqual({
            isCallboardView: false,
            activeParticipantKey: 'beta',
        })
        expect(resolveActiveTeamParticipantKey(['alpha', 'beta'], 'thread-1', null)).toEqual({
            isCallboardView: true,
            activeParticipantKey: null,
        })
        expect(resolveActiveTeamParticipantKey(['alpha', 'beta'], null, null)).toEqual({
            isCallboardView: false,
            activeParticipantKey: 'alpha',
        })
    })

    it('builds active participant chat keys and loading states', () => {
        expect(buildActiveTeamParticipantChatKey('team-1', 'thread-1', 'alpha')).toBe(
            'team:team-1:thread:thread-1:participant:alpha',
        )
        expect(buildActiveTeamParticipantChatKey('team-1', null, 'alpha')).toBeNull()

        expect(buildTeamParticipantLoadingStates({
            currentThread: {
                id: 'thread-1',
                teamId: 'team-1',
                status: 'idle',
                participantSessions: {
                    alpha: 'session-1',
                    beta: 'session-2',
                },
                participantStatuses: {
                    alpha: { type: 'busy', updatedAt: 1 },
                    beta: { type: 'idle', updatedAt: 1 },
                },
                createdAt: 1,
            },
            participantKeys: ['alpha', 'beta'],
        })).toEqual(new Map([
            ['alpha', true],
            ['beta', false],
        ]))
    })

    it('prefers actual session activity over thread retry markers for tab loading dots', () => {
        expect(buildTeamParticipantLoadingStates({
            currentThread: {
                id: 'thread-1',
                teamId: 'team-1',
                status: 'idle',
                participantSessions: {
                    alpha: 'session-1',
                    beta: 'session-2',
                },
                participantStatuses: {
                    alpha: { type: 'retry', updatedAt: 1, message: 'Deferred wake pending' },
                    beta: { type: 'busy', updatedAt: 1 },
                },
                createdAt: 1,
            },
            participantKeys: ['alpha', 'beta'],
            executionStatesByParticipant: {
                alpha: {
                    loading: false,
                    status: { type: 'idle' },
                    messages: [],
                },
                beta: {
                    loading: true,
                    status: { type: 'busy' },
                    messages: [],
                },
            },
        })).toEqual(new Map([
            ['alpha', false],
            ['beta', true],
        ]))
    })

    it('builds participant execution state maps from thread session ids', () => {
        expect(buildTeamParticipantExecutionStates({
            currentThread: {
                id: 'thread-1',
                teamId: 'team-1',
                status: 'idle',
                participantSessions: {
                    alpha: 'session-1',
                },
                participantStatuses: {},
                createdAt: 1,
            },
            participantKeys: ['alpha', 'beta'],
            sessionLoadingById: { 'session-1': true },
            sessionStatusesById: { 'session-1': { type: 'busy' } },
            sessionMessagesById: { 'session-1': [{ id: 'msg-1', role: 'assistant', content: 'Working', timestamp: 1 }] },
            sessionPermissionsById: {},
            sessionQuestionsById: {},
        })).toEqual({
            alpha: {
                loading: true,
                status: { type: 'busy' },
                messages: [{ id: 'msg-1', role: 'assistant', content: 'Working', timestamp: 1 }],
                permission: null,
                question: null,
            },
            beta: null,
        })
    })

    it('builds composer disabled state and placeholder text in priority order', () => {
        expect(buildTeamChatComposerState({
            input: '',
            noParticipants: true,
            readinessRunnable: true,
            hasCurrentThread: true,
            modelConfigured: true,
            isLoading: false,
            activeParticipantLabel: 'Researcher',
            activeParticipantKey: 'researcher',
        })).toMatchObject({
            composerDisabled: true,
            sendDisabled: true,
            inputPlaceholder: 'Add Studio Agents first...',
        })

        expect(buildTeamChatComposerState({
            input: 'hello',
            noParticipants: false,
            readinessRunnable: true,
            hasCurrentThread: true,
            modelConfigured: true,
            isLoading: false,
            activeParticipantLabel: 'Researcher',
            activeParticipantKey: 'researcher',
        })).toMatchObject({
            composerDisabled: false,
            sendDisabled: false,
            inputPlaceholder: 'Message Researcher...',
        })
    })

    it('treats idle participant runtime states as not loading', () => {
        expect(buildTeamParticipantLoadingStates({
            currentThread: {
                id: 'thread-1',
                teamId: 'team-1',
                status: 'idle',
                participantSessions: {
                    alpha: 'session-1',
                },
                participantStatuses: {
                    alpha: { type: 'idle', updatedAt: 1 },
                },
                createdAt: 1,
            },
            participantKeys: ['alpha'],
        })).toEqual(new Map([
            ['alpha', false],
        ]))
    })

    it('resolves draft and registry participant agents', () => {
        expect(resolveTeamParticipantAgent(baseTeam, 'alpha', agents)?.name).toBe('Alpha')
        expect(resolveTeamParticipantAgent(baseTeam, 'beta', agents)?.name).toBe('Beta')
        expect(resolveTeamParticipantAgent(baseTeam, 'missing', agents)).toBeNull()
        expect(resolveTeamParticipantAgent(null, 'alpha', agents)).toBeNull()
    })
})
