import type { TeamDefinition, TeamRelation, ParticipantSubscriptions } from './team-types.js'
import type { SharedPrimitiveRef } from './chat-contracts.js'

export type TeamDefinitionAgentInput = {
    id: string
    name?: string
    meta?: {
        derivedFrom?: string | null
        authoring?: {
            description?: string
        }
    }
}

export type TeamDefinitionParticipantBindingInput = {
    agentRef: SharedPrimitiveRef
    displayName?: string
    subscriptions?: ParticipantSubscriptions
    description?: string
}

export type TeamDefinitionWorkspaceInput = {
    id: string
    name: string
    description?: string
    teamRules?: string[]
    participants: Record<string, TeamDefinitionParticipantBindingInput>
    relations: TeamRelation[]
    safety?: TeamDefinition['safety']
}

export function resolveAgentFromTeamBindingInput(
    agents: TeamDefinitionAgentInput[],
    binding: TeamDefinitionParticipantBindingInput | null | undefined,
) {
    if (!binding) return null
    const ref = binding.agentRef
    return ref.kind === 'draft'
        ? agents.find((agent) =>
            agent.id === ref.draftId
            || agent.meta?.derivedFrom === `draft:${ref.draftId}`,
        ) || null
        : agents.find((agent) => agent.meta?.derivedFrom === ref.urn) || null
}

function normalizeSubscriptions(subscriptions: ParticipantSubscriptions | null | undefined): ParticipantSubscriptions | undefined {
    if (!subscriptions) return undefined
    const callboardKeys = Array.isArray(subscriptions.callboardKeys) ? subscriptions.callboardKeys : undefined
    return {
        ...subscriptions,
        ...(callboardKeys ? { callboardKeys } : {}),
    }
}

function resolveParticipantDescription(
    binding: TeamDefinitionParticipantBindingInput,
    agents: TeamDefinitionAgentInput[],
) {
    const explicit = binding.description?.trim()
    if (explicit) return explicit
    const agent = resolveAgentFromTeamBindingInput(agents, binding)
    const description = agent?.meta?.authoring?.description?.trim()
    return description ? description : undefined
}

export function buildTeamDefinition(
    team: TeamDefinitionWorkspaceInput,
    agents: TeamDefinitionAgentInput[] = [],
): TeamDefinition {
    return {
        id: team.id,
        name: team.name,
        description: team.description,
        teamRules: team.teamRules,
        participants: Object.fromEntries(
            Object.entries(team.participants).map(([key, binding]) => [key, {
                agentRef: binding.agentRef,
                displayName: binding.displayName,
                description: resolveParticipantDescription(binding, agents),
                subscriptions: normalizeSubscriptions(binding.subscriptions),
            }]),
        ),
        relations: team.relations,
        safety: team.safety,
    }
}
