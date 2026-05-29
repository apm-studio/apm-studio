import type { AssistantWorkspaceContext } from '../../../shared/assistant-actions.js'
import { inferAssistantPromptIntent, scoreByTokens } from './assistant-context-intent.js'
import { selectPromptEntries } from './assistant-context-selection.js'
import {
    ASSISTANT_CONTEXT_LIMITS,
    summarizeAgent,
    summarizeDraft,
    summarizeModel,
    summarizeTeam,
} from './assistant-context-summaries.js'

export function optimizeAssistantWorkspaceContext(
    context: AssistantWorkspaceContext | null | undefined,
    userMessage: string | undefined,
) {
    const source = context || { workingDir: '', view: null, agents: [], teams: [], drafts: [], availableModels: [] }
    const intent = inferAssistantPromptIntent(userMessage)
    const selectedAgentIds = new Set([
        source.view?.selectedAgentId || '',
        source.view?.activeChatAgentId || '',
    ].filter(Boolean))
    const selectedTeamIds = new Set([
        source.view?.selectedTeamId || '',
    ].filter(Boolean))
    const selectedDraftIds = new Set([
        source.view?.selectedMarkdownEditorId || '',
    ].filter(Boolean))
    const usedModels = new Set(source.agents
        .map((agent) => agent.model ? `${agent.model.provider}:${agent.model.modelId}` : '')
        .filter(Boolean))

    const agentSelection = selectPromptEntries(source.agents, {
        limit: intent.includeAll ? ASSISTANT_CONTEXT_LIMITS.agentsAll : ASSISTANT_CONTEXT_LIMITS.agents,
        score: (agent) => (
            (selectedAgentIds.has(agent.id) ? 100 : 0)
            + scoreByTokens(`${agent.id} ${agent.name} ${agent.description || ''}`, intent.tokens)
        ),
    })
    const teamSelection = selectPromptEntries(source.teams, {
        limit: intent.includeAll ? ASSISTANT_CONTEXT_LIMITS.teamsAll : ASSISTANT_CONTEXT_LIMITS.teams,
        score: (team) => (
            (selectedTeamIds.has(team.id) ? 100 : 0)
            + scoreByTokens([
                team.id,
                team.name,
                team.description || '',
                ...team.participants.map((participant) => `${participant.key} ${participant.agentName} ${participant.description || ''}`),
                ...team.relations.map((relation) => `${relation.id} ${relation.name} ${relation.description || ''}`),
            ].join(' '), intent.tokens)
        ),
    })
    const draftSelection = selectPromptEntries(source.drafts, {
        limit: intent.includeAll ? ASSISTANT_CONTEXT_LIMITS.draftsAll : ASSISTANT_CONTEXT_LIMITS.drafts,
        score: (draft) => (
            (selectedDraftIds.has(draft.id) ? 100 : 0)
            + scoreByTokens(`${draft.id} ${draft.kind} ${draft.name} ${draft.slug || ''} ${draft.description || ''} ${(draft.tags || []).join(' ')}`, intent.tokens)
        ),
    })
    const modelSelection = selectPromptEntries(source.availableModels, {
        limit: intent.includeAll || intent.includeModelVariants
            ? ASSISTANT_CONTEXT_LIMITS.modelsAll
            : ASSISTANT_CONTEXT_LIMITS.models,
        score: (model) => (
            (usedModels.has(`${model.provider}:${model.modelId}`) ? 25 : 0)
            + scoreByTokens(`${model.provider} ${model.providerName} ${model.modelId} ${model.name}`, intent.tokens)
        ),
    })

    return {
        workingDir: source.workingDir,
        view: source.view,
        context: {
            optimized: true,
            intent: {
                geometry: intent.includeGeometry,
                modelVariants: intent.includeModelVariants,
                teamDetails: intent.includeTeamDetails,
                draftDetails: intent.includeDraftDetails,
                broadRequest: intent.includeAll,
            },
            totals: {
                agents: source.agents.length,
                teams: source.teams.length,
                drafts: source.drafts.length,
                availableModels: source.availableModels.length,
            },
            omitted: {
                agents: agentSelection.omitted,
                teams: teamSelection.omitted,
                drafts: draftSelection.omitted,
                availableModels: modelSelection.omitted,
            },
            note: 'Expanded records are selected from the current view, user wording, and action intent. If a needed target was omitted and the user did not name it exactly, ask one short clarifying question.',
        },
        agents: agentSelection.selected.map((agent) =>
            summarizeAgent(
                agent,
                intent,
                selectedAgentIds.has(agent.id)
                    || intent.includeTeamDetails
                    || scoreByTokens(`${agent.name} ${agent.description || ''}`, intent.tokens) > 0,
            ),
        ),
        teams: teamSelection.selected.map((team) =>
            summarizeTeam(
                team,
                intent,
                selectedTeamIds.has(team.id)
                    || scoreByTokens(`${team.name} ${team.description || ''}`, intent.tokens) > 0,
            ),
        ),
        drafts: draftSelection.selected.map((draft) =>
            summarizeDraft(
                draft,
                intent,
                selectedDraftIds.has(draft.id)
                    || scoreByTokens(`${draft.name} ${draft.description || ''}`, intent.tokens) > 0,
            ),
        ),
        availableModels: modelSelection.selected.map((model) =>
            summarizeModel(
                model,
                intent,
                usedModels.has(`${model.provider}:${model.modelId}`)
                    || scoreByTokens(`${model.provider} ${model.modelId} ${model.name}`, intent.tokens) > 0,
            ),
        ),
    }
}
