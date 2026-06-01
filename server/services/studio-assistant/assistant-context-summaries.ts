import type { AssistantWorkspaceContext } from '../../../shared/assistant-actions.js'
import type { AssistantPromptIntent } from './assistant-context-intent.js'

export const ASSISTANT_CONTEXT_LIMITS = {
    agents: 18,
    agentsAll: 48,
    teams: 10,
    teamsAll: 24,
    drafts: 16,
    draftsAll: 36,
    models: 10,
    modelsAll: 24,
    description: 260,
    relationDescription: 220,
} as const

function compactText(value: string | null | undefined, limit: number) {
    const normalized = value?.replace(/\s+/g, ' ').trim()
    if (!normalized) return undefined
    if (normalized.length <= limit) return normalized
    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`
}

export function summarizeAgent(
    agent: AssistantWorkspaceContext['agents'][number],
    intent: AssistantPromptIntent,
    expanded: boolean,
) {
    return {
        id: agent.id,
        name: agent.name,
        ...(expanded ? { description: compactText(agent.description, ASSISTANT_CONTEXT_LIMITS.description) } : {}),
        ...(intent.includeGeometry ? {
            position: agent.position,
            size: agent.size,
            hidden: agent.hidden,
        } : {}),
        model: agent.model,
        modelVariant: agent.modelVariant,
        skillUrns: agent.skillUrns,
        skillDraftIds: agent.skillDraftIds,
    }
}

export function summarizeTeam(
    team: AssistantWorkspaceContext['teams'][number],
    intent: AssistantPromptIntent,
    expanded: boolean,
) {
    const includeDetails = expanded || intent.includeTeamDetails
    return {
        id: team.id,
        name: team.name,
        ...(includeDetails ? { description: compactText(team.description, ASSISTANT_CONTEXT_LIMITS.description) } : {}),
        ...(intent.includeGeometry ? {
            position: team.position,
            size: team.size,
            hidden: team.hidden,
        } : {}),
        ...(includeDetails ? {
            teamRules: team.teamRules,
            safety: team.safety,
        } : {}),
        participants: team.participants.map((participant) => ({
            key: participant.key,
            agentName: participant.agentName,
            agentId: participant.agentId,
            ...(includeDetails && participant.displayName ? { displayName: participant.displayName } : {}),
            ...(includeDetails ? { description: compactText(participant.description, ASSISTANT_CONTEXT_LIMITS.description) } : {}),
            ...(includeDetails && participant.subscriptions ? { subscriptions: participant.subscriptions } : {}),
        })),
        relations: includeDetails
            ? team.relations.map((relation) => ({
                id: relation.id,
                name: relation.name,
                description: compactText(relation.description, ASSISTANT_CONTEXT_LIMITS.relationDescription),
                between: relation.between,
                direction: relation.direction,
            }))
            : team.relations.map((relation) => ({
                id: relation.id,
                name: relation.name,
                between: relation.between,
                direction: relation.direction,
            })),
    }
}

export function summarizeDraft(
    draft: AssistantWorkspaceContext['drafts'][number],
    intent: AssistantPromptIntent,
    expanded: boolean,
) {
    const includeDetails = expanded || intent.includeDraftDetails
    return {
        id: draft.id,
        kind: draft.kind,
        name: draft.name,
        slug: draft.slug,
        ...(includeDetails ? { description: compactText(draft.description, ASSISTANT_CONTEXT_LIMITS.description) } : {}),
        ...(includeDetails && draft.tags?.length ? { tags: draft.tags.slice(0, 8) } : {}),
        saveState: draft.saveState,
    }
}

export function summarizeModel(
    model: AssistantWorkspaceContext['availableModels'][number],
    intent: AssistantPromptIntent,
    expanded: boolean,
) {
    return {
        provider: model.provider,
        providerName: model.providerName,
        modelId: model.modelId,
        name: model.name,
        ...((expanded || intent.includeModelVariants) && model.variants?.length
            ? { variants: model.variants.slice(0, 8) }
            : {}),
    }
}
