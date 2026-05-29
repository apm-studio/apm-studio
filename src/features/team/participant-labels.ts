import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
/**
 * Resolve a human-readable label for a Team participant.
 * Participant keys are stable Team-local identifiers.
 * The linked agent name is only a display label and may change later.
 */
export function resolveTeamParticipantLabel(
    team: WorkspaceTeamSnapshot | null | undefined,
    participantKey: string,
    agents: WorkspaceAgentNode[],
) {
    if (!team) return participantKey
    const binding = team.participants[participantKey]
    if (!binding) return participantKey

    // Prefer the linked agent's current display name when available.
    const ref = binding.agentRef
    if (ref.kind === 'draft') {
        const found = agents.find((agent) => agent.id === ref.draftId)
        if (found?.name?.trim()) return found.name
    } else if (ref.kind === 'registry') {
        const found = agents.find((agent) => agent.meta?.derivedFrom === ref.urn)
        if (found?.name?.trim()) return found.name
    }

    return binding.displayName?.trim() || participantKey
}
