import type { WorkspaceAgentNode, WorkspaceTeamParticipantBinding, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import type { ParticipantSubscriptions } from '../../../shared/team-types'
type ParticipantSubscriptionsLike = Pick<ParticipantSubscriptions, 'messagesFrom' | 'messageTags' | 'callboardKeys' | 'eventTypes'>

export function getCallboardKeys(subscriptions: ParticipantSubscriptionsLike | null | undefined) {
    return subscriptions?.callboardKeys || []
}

export function nextSubscriptions(
    subscriptions: ParticipantSubscriptionsLike | null | undefined,
    patch: Partial<ParticipantSubscriptionsLike>,
) {
    return { ...subscriptions, ...patch }
}

export function isAgentAttachedToTeam(team: WorkspaceTeamSnapshot, agent: WorkspaceAgentNode) {
    const derivedFrom = agent.meta?.derivedFrom?.trim()
    return Object.values(team.participants).some((binding: WorkspaceTeamParticipantBinding) => (
        (binding.agentRef.kind === 'draft' && binding.agentRef.draftId === agent.id)
        || (binding.agentRef.kind === 'registry' && !!derivedFrom && binding.agentRef.urn === derivedFrom)
    ))
}
