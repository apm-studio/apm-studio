import type {
    WorkspaceAgentNode,
    WorkspaceTeamParticipantBinding,
} from '../../shared/workspace-contracts'
import { describe, expect, it } from 'vitest'
import {
    describeTeamParticipantRef,
    agentByDraftId,
    agentByRegistryUrn,
    resolveAgentFromTeamBinding,
} from './team-participants'

const agents: WorkspaceAgentNode[] = [
    {
        id: 'agent-1',
        name: 'Draft Agent',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        instructionRef: null,
        skillRefs: [],
        mcpServerNames: [],
    },
    {
        id: 'agent-2',
        name: 'Registry Agent',
        position: { x: 0, y: 0 },
        scope: 'shared',
        model: null,
        instructionRef: null,
        skillRefs: [],
        mcpServerNames: [],
        meta: {
            derivedFrom: 'agent://registry',
        },
    },
]

describe('team participant helpers', () => {
    it('resolves draft and registry agents', () => {
        expect(agentByDraftId(agents, 'agent-1')?.name).toBe('Draft Agent')
        expect(agentByRegistryUrn(agents, 'agent://registry')?.name).toBe('Registry Agent')
    })

    it('resolves agent from a participant binding and describes the ref', () => {
        const draftBinding: WorkspaceTeamParticipantBinding = {
            agentRef: { kind: 'draft', draftId: 'agent-1' },
            position: { x: 0, y: 0 },
        }
        const registryBinding: WorkspaceTeamParticipantBinding = {
            agentRef: { kind: 'registry', urn: 'agent://registry' },
            position: { x: 10, y: 10 },
        }

        expect(resolveAgentFromTeamBinding(agents, draftBinding)?.name).toBe('Draft Agent')
        expect(resolveAgentFromTeamBinding(agents, registryBinding)?.name).toBe('Registry Agent')
        expect(describeTeamParticipantRef(draftBinding, 'fallback')).toBe('agent-1')
        expect(describeTeamParticipantRef(registryBinding, 'fallback')).toBe('agent://registry')
        expect(describeTeamParticipantRef(null, 'fallback')).toBe('fallback')
    })
})
