import type { WorkspaceAgentNode, WorkspaceTeamParticipantBinding, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { describe, it, expect } from 'vitest'
import {
    normalizeSubscriptions,
    fallbackParticipantLabel,
    autoLayoutBindings,
    createTeamParticipantBinding,
    findExistingParticipantKey,
    agentNodeToTeamRef,
    resolveTeamParticipantName,
    sameTeamParticipantRef,
} from './participant-bindings'
import {
    buildTeamThreadSelectionState,
    buildDeletedTeamThreadState,
    buildTeamEditorSelectionState,
    createTeamEditorState,
    buildTeamSelectionState,
    buildSelectTeamState,
    resolveTeamEditorStateAfterRelationRemoval,
    resolveSelectedTeamThreadState,
} from './selection-state'
import {
    collectRemovedTeamParticipantChatKeys,
    listTeamThreadChatKeys,
} from './team-thread-sync'
import type { StudioState } from '../types'

describe('normalizeSubscriptions', () => {
    it('normalizes empty subscriptions to undefined', () => {
        expect(normalizeSubscriptions(null)).toBeUndefined()
        expect(normalizeSubscriptions(undefined)).toBeUndefined()
    })

    it('passes through valid subscriptions', () => {
        const input = { callboardKeys: ['a', 'b'], messagesFrom: ['participant-1'] }
        const result = normalizeSubscriptions(input)
        expect(result).toEqual(input)
    })

    it('preserves subscriptions without callboardKeys', () => {
        const input = { eventTypes: ['runtime.idle' as const] }
        const result = normalizeSubscriptions(input)
        expect(result).toEqual(input)
        expect(result?.callboardKeys).toBeUndefined()
    })
})

describe('fallbackParticipantLabel', () => {
    it('returns draftId for draft refs', () => {
        expect(fallbackParticipantLabel({ kind: 'draft', draftId: 'my-draft' })).toBe('my-draft')
    })

    it('returns last segment of URN for registry refs', () => {
        expect(fallbackParticipantLabel({ kind: 'registry', urn: 'agent/@user/my-agent' })).toBe('my-agent')
    })

    it('returns full URN when no slash', () => {
        expect(fallbackParticipantLabel({ kind: 'registry', urn: 'single' })).toBe('single')
    })
})

describe('autoLayoutBindings', () => {
    it('returns empty object for empty bindings', () => {
        expect(autoLayoutBindings({})).toEqual({})
    })

    it('positions single binding at origin', () => {
        const result = autoLayoutBindings({
            k1: { agentRef: { kind: 'draft', draftId: 'd1' }, position: { x: 0, y: 0 } },
        })
        expect(result.k1.position).toEqual({ x: 40, y: 120 })
    })

    it('lays out 3 entries in a single row', () => {
        const bindings: Record<string, WorkspaceTeamParticipantBinding> = {}
        for (let i = 0; i < 3; i++) {
            bindings[`k${i}`] = {
                agentRef: { kind: 'draft', draftId: `d${i}` },
                position: { x: 0, y: 0 },
            }
        }
        const result = autoLayoutBindings(bindings)
        // 3 entries → 3 columns, so all y = 120 (row 0)
        expect(result.k0.position.y).toBe(120)
        expect(result.k1.position.y).toBe(120)
        expect(result.k2.position.y).toBe(120)
        // x should increment by gapX (260)
        expect(result.k1.position.x - result.k0.position.x).toBe(260)
    })

    it('wraps to next row for 4+ entries', () => {
        const bindings: Record<string, WorkspaceTeamParticipantBinding> = {}
        for (let i = 0; i < 4; i++) {
            bindings[`k${i}`] = {
                agentRef: { kind: 'draft', draftId: `d${i}` },
                position: { x: 0, y: 0 },
            }
        }
        const result = autoLayoutBindings(bindings)
        // 4 entries → columns = min(3, ceil(sqrt(4))) = 2
        // k0: (40, 120), k1: (300, 120), k2: (40, 300), k3: (300, 300)
        expect(result.k0.position.y).toBe(120)
        expect(result.k2.position.y).toBe(120 + 180) // gapY = 180
    })
})

describe('participant binding helpers', () => {
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

    const team: WorkspaceTeamSnapshot = {
        id: 'team-1',
        name: 'Team',
        position: { x: 0, y: 0 },
        width: 400,
        height: 300,
        participants: {
            alpha: {
                agentRef: { kind: 'draft', draftId: 'agent-1' },
                displayName: 'Alpha Display',
                position: { x: 0, y: 0 },
            },
        },
        relations: [],
        createdAt: Date.now(),
    }

    it('compares and derives participant refs', () => {
        expect(sameTeamParticipantRef(
            { kind: 'draft', draftId: 'agent-1' },
            { kind: 'draft', draftId: 'agent-1' },
        )).toBe(true)
        expect(sameTeamParticipantRef(
            { kind: 'registry', urn: 'agent://beta' },
            { kind: 'registry', urn: 'agent://beta' },
        )).toBe(true)
        expect(agentNodeToTeamRef(agents[0])).toEqual({ kind: 'draft', draftId: 'agent-1' })
        expect(agentNodeToTeamRef(agents[1])).toEqual({ kind: 'registry', urn: 'agent://beta' })
        expect(agentNodeToTeamRef({
            ...agents[0],
            meta: { derivedFrom: 'draft:agent-draft-1' },
        })).toEqual({ kind: 'draft', draftId: 'agent-draft-1' })
    })

    it('resolves participant names, existing keys, and bindings consistently', () => {
        expect(resolveTeamParticipantName(agents, team.participants.alpha, 'alpha')).toBe('Alpha')
        expect(findExistingParticipantKey(team, { kind: 'draft', draftId: 'agent-1' })).toBe('alpha')

        const created = createTeamParticipantBinding({
            team,
            agents,
            agentRef: { kind: 'registry', urn: 'agent://beta' },
        })
        expect(created.binding.displayName).toBe('Beta')
        expect(created.binding.position).toEqual({ x: 300, y: 100 })
    })

    it('builds team selection state without clearing the active team editor', () => {
        expect(buildTeamSelectionState({
            teamEditorState: { teamId: 'team-1', mode: 'participant', participantKey: 'alpha', relationId: null },
        } as unknown as StudioState, 'team-1')).toEqual({
            selectedTeamId: 'team-1',
            selectedAgentId: null,
            selectedAgentSessionId: null,
            teamEditorState: { teamId: 'team-1', mode: 'participant', participantKey: 'alpha', relationId: null },
        })
    })

    it('builds editor selection state while clearing agent session selection', () => {
        expect(buildTeamEditorSelectionState({
            selectedAgentId: 'agent-1',
            selectedAgentSessionId: 'session-1',
            teamEditorState: null,
        } as unknown as StudioState, 'team-1', {
            teamId: 'team-1',
            mode: 'relation',
            participantKey: null,
            relationId: 'rel-1',
        })).toEqual({
            selectedTeamId: 'team-1',
            selectedAgentId: null,
            selectedAgentSessionId: null,
            teamEditorState: {
                teamId: 'team-1',
                mode: 'relation',
                participantKey: null,
                relationId: 'rel-1',
            },
        })
    })

    it('creates and resets team editor state consistently', () => {
        expect(createTeamEditorState('team-1', 'participant', { participantKey: 'alpha' })).toEqual({
            teamId: 'team-1',
            mode: 'participant',
            participantKey: 'alpha',
            relationId: null,
        })

        expect(createTeamEditorState('team-1', 'team', { tab: 'relations' })).toEqual({
            teamId: 'team-1',
            mode: 'team',
            tab: 'relations',
            participantKey: null,
            relationId: null,
        })

        expect(resolveTeamEditorStateAfterRelationRemoval(
            createTeamEditorState('team-1', 'participant', { participantKey: 'alpha' }),
            'team-1',
            'rel-1',
            {},
        )).toEqual(createTeamEditorState('team-1', 'team'))

        expect(resolveTeamEditorStateAfterRelationRemoval(
            createTeamEditorState('team-1', 'relation', { relationId: 'rel-1' }),
            'team-1',
            'rel-1',
            { alpha: {} },
        )).toEqual(createTeamEditorState('team-1', 'team'))

        expect(resolveTeamEditorStateAfterRelationRemoval(
            createTeamEditorState('team-1', 'relation', { relationId: 'rel-2' }),
            'team-1',
            'rel-1',
            { alpha: {} },
        )).toEqual(createTeamEditorState('team-1', 'relation', { relationId: 'rel-2' }))
    })

    it('builds select-team state with preferred thread and preserved participant', () => {
        const state = {
            selectedTeamId: 'team-1',
            selectedAgentId: 'agent-1',
            selectedAgentSessionId: 'session-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            focusSnapshot: { nodeId: 'team-1', type: 'team' },
            teamEditorState: { teamId: 'team-1', mode: 'participant', participantKey: 'alpha', relationId: null },
            teamThreads: {
                'team-1': [
                    { id: 'thread-1', createdAt: 1 },
                    { id: 'thread-2', createdAt: 2 },
                ],
            },
            teams: [team],
        } as unknown as StudioState

        expect(buildSelectTeamState(state, 'team-1')).toEqual({
            selectedTeamId: 'team-1',
            selectedAgentId: null,
            selectedAgentSessionId: null,
            teamEditorState: { teamId: 'team-1', mode: 'participant', participantKey: 'alpha', relationId: null },
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
        })
    })

    it('preserves the participant when returning to an team with the same active thread', () => {
        const state = {
            selectedTeamId: null,
            selectedAgentId: 'agent-1',
            selectedAgentSessionId: 'session-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            focusSnapshot: { nodeId: 'agent-1', type: 'agent' },
            teamEditorState: null,
            teamThreads: {
                'team-1': [
                    { id: 'thread-1', createdAt: 1 },
                    { id: 'thread-2', createdAt: 2 },
                ],
            },
            teams: [team],
        } as unknown as StudioState

        expect(buildSelectTeamState(state, 'team-1')).toEqual({
            selectedTeamId: 'team-1',
            selectedAgentId: null,
            selectedAgentSessionId: null,
            teamEditorState: null,
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
        })
    })

    it('resolves selected-thread state only for the selected team', () => {
        const state = {
            selectedTeamId: 'team-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            teams: [team],
        } as unknown as StudioState

        expect(resolveSelectedTeamThreadState(state, 'team-1', [{ id: 'thread-2', createdAt: 2 }])).toEqual({
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: 'alpha',
        })
        expect(resolveSelectedTeamThreadState(state, 'team-2', [{ id: 'thread-9', createdAt: 9 }])).toEqual({
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
        })
    })

    it('builds thread selection and deletion state consistently', () => {
        const state = {
            selectedTeamId: 'team-1',
            selectedAgentId: 'agent-1',
            selectedAgentSessionId: 'session-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            teamEditorState: { teamId: 'team-1', mode: 'participant', participantKey: 'alpha', relationId: null },
            teamThreads: {
                'team-1': [
                    { id: 'thread-1', createdAt: 1 },
                    { id: 'thread-2', createdAt: 2 },
                ],
            },
            teams: [team],
        } as unknown as StudioState

        expect(buildTeamThreadSelectionState(state, 'team-1', 'thread-2', 'alpha')).toEqual({
            selectedTeamId: 'team-1',
            selectedAgentId: null,
            selectedAgentSessionId: null,
            teamEditorState: { teamId: 'team-1', mode: 'participant', participantKey: 'alpha', relationId: null },
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: 'alpha',
        })
        expect(buildDeletedTeamThreadState(state, 'team-1', 'thread-1')).toEqual({
            teamThreads: {
                'team-1': [{ id: 'thread-2', createdAt: 2 }],
            },
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: 'alpha',
        })
    })

    it('preserves the current participant when selecting a thread without an explicit tab choice', () => {
        const state = {
            selectedTeamId: 'team-1',
            selectedAgentId: null,
            selectedAgentSessionId: null,
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
            teamEditorState: null,
            teams: [team],
        } as unknown as StudioState

        expect(buildTeamThreadSelectionState(state, 'team-1', 'thread-2')).toEqual({
            selectedTeamId: 'team-1',
            selectedAgentId: null,
            selectedAgentSessionId: null,
            teamEditorState: null,
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: 'alpha',
        })

        expect(buildTeamThreadSelectionState(state, 'team-1', 'thread-2', null)).toEqual({
            selectedTeamId: 'team-1',
            selectedAgentId: null,
            selectedAgentSessionId: null,
            teamEditorState: null,
            activeThreadId: 'thread-2',
            activeThreadParticipantKey: null,
        })
    })

    it('collects team thread chat keys via parsed targets', () => {
        const state = {
            chatKeyToSession: {
                'team:team-1:thread:thread-1:participant:alpha': 'session-1',
                'team:team-1:thread:thread-2:participant:alpha': 'session-2',
                'team:team-2:thread:thread-1:participant:beta': 'session-3',
                'agent-1': 'session-4',
            },
        } as unknown as StudioState

        expect(listTeamThreadChatKeys(state, 'team-1', 'thread-1')).toEqual([
            'team:team-1:thread:thread-1:participant:alpha',
        ])
        expect(collectRemovedTeamParticipantChatKeys(
            state,
            'team-1',
            new Set(['thread-2']),
            { 'team:team-1:thread:thread-2:participant:alpha': 'session-2' },
        )).toEqual([
            'team:team-1:thread:thread-1:participant:alpha',
        ])
    })
})
