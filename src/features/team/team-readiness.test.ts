import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { describe, it, expect } from 'vitest'
import { evaluateTeamReadiness } from './team-readiness'
function makeAgent(overrides: Partial<WorkspaceAgentNode> = {}): WorkspaceAgentNode {
    return {
        id: 'p1',
        name: 'Test Agent',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: { provider: 'openai', modelId: 'gpt-4o' },
        skillRefs: [],
        mcpServerNames: [],
        ...overrides,
    }
}

function makeTeam(overrides: Partial<WorkspaceTeamSnapshot> = {}): WorkspaceTeamSnapshot {
    return {
        id: 'team-1',
        name: 'Test Team',
        position: { x: 0, y: 0 },
        width: 600,
        height: 400,
        participants: {},
        relations: [],
        createdAt: Date.now(),
        ...overrides,
    }
}

describe('evaluateTeamReadiness', () => {
    it('returns error when there are no participants', () => {
        const result = evaluateTeamReadiness(makeTeam(), [])
        expect(result.runnable).toBe(false)
        expect(result.issues).toHaveLength(1)
        expect(result.issues[0].code).toBe('no-participants')
        expect(result.issues[0].severity).toBe('error')
    })

    it('returns runnable for single participant with model', () => {
        const agent = makeAgent({ id: 'p1' })
        const team = makeTeam({
            participants: {
                'agent-a': {
                    agentRef: { kind: 'draft', draftId: 'p1' },
                    position: { x: 0, y: 0 },
                },
            },
        })
        const result = evaluateTeamReadiness(team, [agent])
        expect(result.runnable).toBe(true)
        expect(result.issues).toHaveLength(0)
    })

    it('returns error when multiple participants have no relations', () => {
        const p1 = makeAgent({ id: 'p1' })
        const p2 = makeAgent({ id: 'p2', name: 'Second' })
        const team = makeTeam({
            participants: {
                'agent-a': { agentRef: { kind: 'draft', draftId: 'p1' }, position: { x: 0, y: 0 } },
                'agent-b': { agentRef: { kind: 'draft', draftId: 'p2' }, position: { x: 100, y: 0 } },
            },
        })
        const result = evaluateTeamReadiness(team, [p1, p2])
        expect(result.runnable).toBe(false)
        const noRelations = result.issues.find((i) => i.code === 'no-relations')
        expect(noRelations).toBeDefined()
        expect(noRelations!.severity).toBe('error')
    })

    it('returns error when relation references unknown participant key', () => {
        const agent = makeAgent({ id: 'p1' })
        const team = makeTeam({
            participants: {
                'agent-a': { agentRef: { kind: 'draft', draftId: 'p1' }, position: { x: 0, y: 0 } },
            },
            relations: [{
                id: 'r1',
                between: ['agent-a', 'ghost'] as [string, string],
                direction: 'both',
                name: 'test',
                description: 'test relation',
            }],
        })
        const result = evaluateTeamReadiness(team, [agent])
        expect(result.runnable).toBe(false)
        expect(result.issues.some((i) => i.code === 'unknown-relation-endpoint')).toBe(true)
    })

    it('returns error when agent ref cannot resolve', () => {
        const team = makeTeam({
            participants: {
                'agent-a': { agentRef: { kind: 'draft', draftId: 'missing' }, position: { x: 0, y: 0 } },
            },
        })
        const result = evaluateTeamReadiness(team, [])
        expect(result.runnable).toBe(false)
        expect(result.issues.some((i) => i.code === 'unresolved-agent')).toBe(true)
    })

    it('returns error when agent has no model configured', () => {
        const agent = makeAgent({ id: 'p1', model: null })
        const team = makeTeam({
            participants: {
                'agent-a': {
                    agentRef: { kind: 'draft', draftId: 'p1' },
                    displayName: 'CEO',
                    position: { x: 0, y: 0 },
                },
            },
        })
        const result = evaluateTeamReadiness(team, [agent])
        expect(result.runnable).toBe(false)
        const issue = result.issues.find((i) => i.code === 'no-model-config')
        expect(issue).toBeDefined()
        expect(issue?.message).toBe('Participant "CEO" has no Studio Agent model configured')
    })

    it('returns warning for disconnected participant', () => {
        const p1 = makeAgent({ id: 'p1' })
        const p2 = makeAgent({ id: 'p2', name: 'Second' })
        const p3 = makeAgent({ id: 'p3', name: 'Third' })
        const team = makeTeam({
            participants: {
                'agent-a': { agentRef: { kind: 'draft', draftId: 'p1' }, position: { x: 0, y: 0 } },
                'agent-b': { agentRef: { kind: 'draft', draftId: 'p2' }, position: { x: 100, y: 0 } },
                'agent-c': { agentRef: { kind: 'draft', draftId: 'p3' }, position: { x: 200, y: 0 } },
            },
            relations: [{
                id: 'r1',
                between: ['agent-a', 'agent-b'] as [string, string],
                direction: 'both',
                name: 'a-b',
                description: 'test',
            }],
        })
        const result = evaluateTeamReadiness(team, [p1, p2, p3])
        // runnable because all have models and at least one relation exists
        expect(result.runnable).toBe(true)
        const disconnected = result.issues.find((i) => i.code === 'disconnected-participant')
        expect(disconnected).toBeDefined()
        expect(disconnected!.severity).toBe('warning')
        expect(disconnected!.message).toContain('agent-c')
    })

    it('resolves registry agent ref by derivedFrom URN', () => {
        const agent = makeAgent({
            id: 'p1',
            meta: { derivedFrom: 'agent/@acme/agent-presets/my-agent' },
        })
        const team = makeTeam({
            participants: {
                'agent-a': {
                    agentRef: { kind: 'registry', urn: 'agent/@acme/agent-presets/my-agent' },
                    position: { x: 0, y: 0 },
                },
            },
        })
        const result = evaluateTeamReadiness(team, [agent])
        expect(result.runnable).toBe(true)
    })

    it('handles fully valid multi-participant Team', () => {
        const p1 = makeAgent({ id: 'p1' })
        const p2 = makeAgent({ id: 'p2', name: 'Second' })
        const team = makeTeam({
            participants: {
                'agent-a': { agentRef: { kind: 'draft', draftId: 'p1' }, position: { x: 0, y: 0 } },
                'agent-b': { agentRef: { kind: 'draft', draftId: 'p2' }, position: { x: 100, y: 0 } },
            },
            relations: [{
                id: 'r1',
                between: ['agent-a', 'agent-b'] as [string, string],
                direction: 'both',
                name: 'test-relation',
                description: 'test',
            }],
        })
        const result = evaluateTeamReadiness(team, [p1, p2])
        expect(result.runnable).toBe(true)
        expect(result.issues).toHaveLength(0)
    })
})
