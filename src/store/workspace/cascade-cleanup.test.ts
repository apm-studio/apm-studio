import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { describe, it, expect } from 'vitest'
import {
    buildDraftDeleteCascade,
    buildPackagePrimitiveDeleteCascade,
    buildAgentDeleteCascade,
} from './cascade-cleanup'
function makeAgent(overrides: Partial<WorkspaceAgentNode> & { id: string }): WorkspaceAgentNode {
    return {
        name: overrides.id,
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        skillRefs: [],
        mcpServerNames: [],
        ...overrides,
    }
}

function makeTeam(overrides: Partial<WorkspaceTeamSnapshot> & { id: string }): WorkspaceTeamSnapshot {
    return {
        name: overrides.id,
        position: { x: 0, y: 0 },
        width: 400,
        height: 420,
        participants: {},
        relations: [],
        createdAt: Date.now(),
        ...overrides,
    }
}

// ── Draft cascade (via buildDraftDeleteCascade wrapper) ─────────

describe('buildDraftDeleteCascade', () => {
    it('returns empty patch when kind is "team"', () => {
        expect(buildDraftDeleteCascade('team', 'draft-1', [], [])).toEqual({})
    })

    it('removes matching skill draft from agent skillRefs', () => {
        const agents = [
            makeAgent({
                id: 'p1',
                skillRefs: [
                    { kind: 'draft', draftId: 'd1' },
                    { kind: 'registry', urn: '/@acme/bar' },
                    { kind: 'draft', draftId: 'd2' },
                ],
            }),
        ]
        const result = buildDraftDeleteCascade('skill', 'd1', agents, [])
        expect(result.agents![0].skillRefs).toEqual([
            { kind: 'registry', urn: '/@acme/bar' },
            { kind: 'draft', draftId: 'd2' },
        ])
        expect(result.workspaceDirty).toBe(true)
    })

    it('returns empty patch when no skill matches', () => {
        const agents = [
            makeAgent({
                id: 'p1',
                skillRefs: [{ kind: 'draft', draftId: 'other' }],
            }),
        ]
        expect(buildDraftDeleteCascade('skill', 'no-match', agents, [])).toEqual({})
    })

    it('removes team participants and relations for deleted agent draft', () => {
        const teams = [
            makeTeam({
                id: 'team-1',
                participants: {
                    k1: { agentRef: { kind: 'draft', draftId: 'agent-draft-1' }, position: { x: 0, y: 0 } },
                    k2: { agentRef: { kind: 'draft', draftId: 'agent-draft-2' }, position: { x: 100, y: 0 } },
                    k3: { agentRef: { kind: 'registry', urn: '/@acme/x' }, position: { x: 200, y: 0 } },
                },
                relations: [
                    { id: 'r1', between: ['k1', 'k2'], direction: 'both' as const, name: 'handoff', description: '' },
                    { id: 'r2', between: ['k2', 'k3'], direction: 'both' as const, name: 'review', description: '' },
                ],
            }),
        ]
        const result = buildDraftDeleteCascade('agent', 'agent-draft-1', [], teams)
        const updatedTeam = result.teams![0]
        expect(Object.keys(updatedTeam.participants)).toEqual(['k2', 'k3'])
        expect(updatedTeam.relations).toHaveLength(1)
        expect(updatedTeam.relations[0].id).toBe('r2')
        expect(result.workspaceDirty).toBe(true)
    })
})

// ── Package primitive cascade ─────────────────────────

describe('buildPackagePrimitiveDeleteCascade', () => {
    it('removes matching skill URN from agent skillRefs', () => {
        const agents = [
            makeAgent({
                id: 'p1',
                skillRefs: [
                    { kind: 'registry', urn: '/@acme/x' },
                    { kind: 'draft', draftId: 'd1' },
                    { kind: 'registry', urn: '/@acme/y' },
                ],
            }),
        ]
        const result = buildPackagePrimitiveDeleteCascade('skill', '/@acme/x', agents, [])
        expect(result.agents![0].skillRefs).toEqual([
            { kind: 'draft', draftId: 'd1' },
            { kind: 'registry', urn: '/@acme/y' },
        ])
    })

    it('removes team participants for removed agent URN', () => {
        const teams = [
            makeTeam({
                id: 'team-1',
                participants: {
                    k1: { agentRef: { kind: 'registry', urn: '/@acme/agent' }, position: { x: 0, y: 0 } },
                    k2: { agentRef: { kind: 'draft', draftId: 'p2' }, position: { x: 100, y: 0 } },
                },
                relations: [
                    { id: 'r1', between: ['k1', 'k2'], direction: 'both' as const, name: 'handoff', description: '' },
                ],
            }),
        ]
        const result = buildPackagePrimitiveDeleteCascade('agent', '/@acme/agent', [], teams)
        expect(Object.keys(result.teams![0].participants)).toEqual(['k2'])
        expect(result.teams![0].relations).toHaveLength(0)
    })

})

// ── Canvas agent delete ──────────────────────────────

describe('buildAgentDeleteCascade', () => {
    it('removes team participants referencing deleted agent.id', () => {
        const teams = [
            makeTeam({
                id: 'team-1',
                participants: {
                    k1: { agentRef: { kind: 'draft', draftId: 'agent-1' }, position: { x: 0, y: 0 } },
                    k2: { agentRef: { kind: 'draft', draftId: 'agent-2' }, position: { x: 100, y: 0 } },
                },
                relations: [
                    { id: 'r1', between: ['k1', 'k2'], direction: 'both' as const, name: 'handoff', description: '' },
                ],
            }),
        ]
        const result = buildAgentDeleteCascade({ id: 'agent-1' }, teams)
        expect(Object.keys(result.teams![0].participants)).toEqual(['k2'])
        expect(result.teams![0].relations).toHaveLength(0)
    })

    it('returns empty patch when no team references the agent', () => {
        const teams = [
            makeTeam({
                id: 'team-1',
                participants: {
                    k1: { agentRef: { kind: 'draft', draftId: 'other' }, position: { x: 0, y: 0 } },
                },
                relations: [],
            }),
        ]
        expect(buildAgentDeleteCascade({ id: 'no-match' }, teams)).toEqual({})
    })

    it('preserves teams that have no matching participants (same reference)', () => {
        const teams = [
            makeTeam({
                id: 'team-1',
                participants: {
                    k1: { agentRef: { kind: 'registry', urn: '/@acme/x' }, position: { x: 0, y: 0 } },
                },
                relations: [],
            }),
            makeTeam({
                id: 'team-2',
                participants: {
                    k1: { agentRef: { kind: 'draft', draftId: 'agent-1' }, position: { x: 0, y: 0 } },
                },
                relations: [],
            }),
        ]
        const result = buildAgentDeleteCascade({ id: 'agent-1' }, teams)
        expect(result.teams![0]).toBe(teams[0])
        expect(Object.keys(result.teams![1].participants)).toEqual([])
    })

    it('removes team participants referencing a linked draft id for the deleted agent', () => {
        const teams = [
            makeTeam({
                id: 'team-1',
                participants: {
                    k1: { agentRef: { kind: 'draft', draftId: 'agent-draft-1' }, position: { x: 0, y: 0 } },
                },
                relations: [],
            }),
        ]
        const result = buildAgentDeleteCascade({
            id: 'agent-1',
            meta: { derivedFrom: 'draft:agent-draft-1' },
        }, teams)
        expect(Object.keys(result.teams![0].participants)).toEqual([])
    })
})
