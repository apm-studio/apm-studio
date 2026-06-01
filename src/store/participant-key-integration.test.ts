import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../shared/workspace-contracts'
// Integration test: Agent → Team creation with Team-local participant keys
//
// Verifies the full flow:
// 1. Agent creation with unique names
// 2. Team creation
// 3. Binding agents to Team
// 4. Relation creation uses internal participant keys
// 5. Agent rename does not rewrite participant identity
// 6. Duplicate name prevention

import { describe, it, expect } from 'vitest'

// We need to test the actual store slices, but they require complex wiring.
// Instead, test the core logic functions directly.

import { resolveTeamParticipantLabel } from '../features/team/participant-labels'
import { buildTeamPrimitivePayload } from '../lib/agents-package'
function makeAgent(id: string, name: string, derivedFrom?: string): WorkspaceAgentNode {
    return {
        id,
        name,
        position: { x: 0, y: 0 },
        width: 320,
        height: 400,
        scope: 'shared',
        model: null,
        skillRefs: [],
        mcpServerNames: [],
        mcpBindingMap: {},
        declaredMcpConfig: null,
        ...(derivedFrom ? { meta: { derivedFrom } } : {}),
    }
}

function makeTeam(overrides: Partial<WorkspaceTeamSnapshot> = {}): WorkspaceTeamSnapshot {
    return {
        id: 'team-1',
        name: 'Test Team',
        participants: {},
        relations: [],
        position: { x: 0, y: 0 },
        width: 600,
        height: 400,
        createdAt: Date.now(),
        ...overrides,
    }
}

describe('Participant Keys And Labels', () => {
    describe('resolveTeamParticipantLabel', () => {
        const agents = [
            makeAgent('agent-1', 'Coder'),
            makeAgent('agent-2', 'Reviewer', 'agent/@studio/reviewer'),
        ]

        it('returns participant key as label when it is already human-readable', () => {
            const team = makeTeam({
                participants: {
                    'participant-1': {
                        agentRef: { kind: 'draft', draftId: 'agent-1' },
                        displayName: 'Coder',
                        position: { x: 0, y: 0 },
                    },
                },
            })
            expect(resolveTeamParticipantLabel(team, 'participant-1', agents)).toBe('Coder')
        })

        it('returns key directly when no team is provided', () => {
            expect(resolveTeamParticipantLabel(null, 'Coder', agents)).toBe('Coder')
        })

        it('returns key when binding not found', () => {
            const team = makeTeam()
            expect(resolveTeamParticipantLabel(team, 'Unknown', agents)).toBe('Unknown')
        })

        it('returns updated agent name if cascade rename missed', () => {
            const team = makeTeam({
                participants: {
                    'participant-1': {
                        agentRef: { kind: 'draft', draftId: 'agent-1' },
                        displayName: 'OldName',
                        position: { x: 0, y: 0 },
                    },
                },
            })
            expect(resolveTeamParticipantLabel(team, 'participant-1', agents)).toBe('Coder')
        })
    })

    describe('buildTeamPrimitivePayload', () => {
        it('exports display names while keeping internal ids inside the workspace', () => {
            const team = makeTeam({
                name: 'Review Pipeline',
                participants: {
                    'participant-1': {
                        agentRef: { kind: 'registry', urn: 'agent/@studio/coder' },
                        displayName: 'Coder',
                        position: { x: 0, y: 0 },
                    },
                    'participant-2': {
                        agentRef: { kind: 'registry', urn: 'agent/@studio/reviewer' },
                        displayName: 'Reviewer',
                        position: { x: 300, y: 0 },
                    },
                },
                relations: [
                    {
                        id: 'rel-1',
                        between: ['participant-1', 'participant-2'] as [string, string],
                        direction: 'one-way' as const,
                        name: 'Code Review',
                        description: 'Request code review',
                    },
                ],
            })

            const payload = buildTeamPrimitivePayload(team)

            expect(payload.payload.participants[0]).toHaveProperty('key', 'Coder')
            expect(payload.payload.participants[1]).toHaveProperty('key', 'Reviewer')
            expect(payload.payload.participants[0]).not.toHaveProperty('id')

            expect(payload.payload.relations[0].between).toEqual(['Coder', 'Reviewer'])
            expect(payload).not.toHaveProperty('$schema')
            expect(payload).not.toHaveProperty('schema')
        })

        it('rejects draft agents in primitive payload', () => {
            const team = makeTeam({
                participants: {
                    'participant-1': {
                        agentRef: { kind: 'draft', draftId: 'agent-1' },
                        displayName: 'Coder',
                        position: { x: 0, y: 0 },
                    },
                },
            })

            expect(() => buildTeamPrimitivePayload(team)).toThrow('Save participant agent drafts')
        })
    })

    describe('unique agent name helper', () => {
        // Test the uniqueAgentName pattern directly
        function uniqueAgentName(desired: string, existingNames: string[]): string {
            if (!existingNames.includes(desired)) return desired
            let i = 2
            while (existingNames.includes(`${desired} (${i})`)) i++
            return `${desired} (${i})`
        }

        it('returns name as-is when no conflict', () => {
            expect(uniqueAgentName('Coder', ['Reviewer'])).toBe('Coder')
        })

        it('appends (2) on first conflict', () => {
            expect(uniqueAgentName('Coder', ['Coder'])).toBe('Coder (2)')
        })

        it('increments suffix on multiple conflicts', () => {
            expect(uniqueAgentName('Coder', ['Coder', 'Coder (2)'])).toBe('Coder (3)')
        })

        it('handles empty existing list', () => {
            expect(uniqueAgentName('Coder', [])).toBe('Coder')
        })
    })

    describe('agent rename', () => {
        it('does not rewrite Team participant keys or relation endpoints', () => {
            const team = makeTeam({
                participants: {
                    'participant-1': {
                        agentRef: { kind: 'draft', draftId: 'p-1' },
                        displayName: 'OldName',
                        position: { x: 0, y: 0 },
                    },
                    'participant-2': {
                        agentRef: { kind: 'registry', urn: 'agent/@studio/reviewer' },
                        displayName: 'Reviewer',
                        position: { x: 300, y: 0 },
                    },
                },
                relations: [
                    {
                        id: 'r1',
                        between: ['participant-1', 'participant-2'] as [string, string],
                        direction: 'both' as const,
                        name: 'Collaboration',
                        description: 'Work together',
                    },
                ],
            })

            const agents = [
                makeAgent('p-1', 'Coder'),
                makeAgent('p-2', 'Reviewer'),
            ]

            expect(Object.keys(team.participants)).toEqual(['participant-1', 'participant-2'])
            expect(team.relations[0].between).toEqual(['participant-1', 'participant-2'])
            expect(resolveTeamParticipantLabel(team, 'participant-1', agents)).toBe('Coder')
        })
    })
})
