import type { WorkspaceAgentNode, WorkspaceTeamParticipantBinding, WorkspaceTeamSnapshot } from '../../shared/workspace-contracts'
export function agentByRegistryUrn(agents: WorkspaceAgentNode[], urn: string): WorkspaceAgentNode | null {
    return agents.find((agent) => agent.meta?.derivedFrom === urn) || null
}

export function agentByDraftId(agents: WorkspaceAgentNode[], draftId: string): WorkspaceAgentNode | null {
    return agents.find((agent) =>
        agent.id === draftId
        || agent.meta?.derivedFrom === `draft:${draftId}`,
    ) || null
}

export function resolveAgentFromTeamBinding(
    agents: WorkspaceAgentNode[],
    binding: WorkspaceTeamParticipantBinding | null | undefined,
): WorkspaceAgentNode | null {
    if (!binding) {
        return null
    }

    return binding.agentRef.kind === 'draft'
        ? agentByDraftId(agents, binding.agentRef.draftId)
        : agentByRegistryUrn(agents, binding.agentRef.urn)
}

export function resolveTeamParticipantAgent(
    team: WorkspaceTeamSnapshot | null | undefined,
    participantKey: string | null,
    agents: WorkspaceAgentNode[],
) {
    if (!team || !participantKey) {
        return null
    }

    return resolveAgentFromTeamBinding(agents, team.participants[participantKey])
}

export function describeTeamParticipantRef(binding: WorkspaceTeamParticipantBinding | null | undefined, fallbackKey: string) {
    if (!binding) {
        return fallbackKey
    }

    return binding.agentRef.kind === 'registry'
        ? binding.agentRef.urn
        : binding.agentRef.draftId
}
