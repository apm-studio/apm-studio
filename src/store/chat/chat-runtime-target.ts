import type {
    AssistantParticipantSubscriptions,
    AssistantWorkspaceTeamParticipantSummary,
    AssistantWorkspaceTeamRelationSummary,
    AssistantWorkspaceTeamSummary,
    AssistantWorkspaceContext,
    } from '../../../shared/assistant-actions'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { TeamRelation } from '../../../shared/team-types'
import type { WorkspaceTeamParticipantBinding,
    WorkspaceTeamSnapshot,
} from '../../../shared/workspace-contracts'
import { describeChatTarget } from '../../../shared/chat-targets'
import { describeTeamParticipantRef,
    resolveAgentFromTeamBinding } from '../../lib/team-participants'
import { resolveAgentRuntimeConfig } from '../../lib/agents'
import { isAssistantChatKey } from '../assistant/slice'
import type { ChatGet } from './chat-internals'

export type ChatRuntimeConfig = {
    agentBody?: string | null
    skillRefs: SharedPrimitiveRef[]
    model: { provider: string; modelId: string } | null
    modelVariant: string | null
    runtimeAgentId: string
    mcpServerNames: string[]
    planMode: boolean
}

export type ResolvedChatRuntimeTarget = {
    chatKey: string
    kind: 'assistant' | 'agent' | 'team-participant'
    name: string
    runtimeConfig: ChatRuntimeConfig
    assistantContext: AssistantWorkspaceContext | null
    executionScope: {
        agentId: string | null
        teamId: string | null
    }
    requestTarget: {
        agentId: string
        agentName: string
        teamId?: string
        teamThreadId?: string
    }
    notice?: string
}

export const EMPTY_RUNTIME_CONFIG: ChatRuntimeConfig = {
    agentBody: null,
    skillRefs: [],
    model: null,
    modelVariant: null,
    runtimeAgentId: 'build',
    mcpServerNames: [],
    planMode: false,
}

function resolveParticipantSummary(
    get: ChatGet,
    participantKey: string,
    binding: WorkspaceTeamParticipantBinding,
): AssistantWorkspaceTeamParticipantSummary {
    const agents = get().agents
    const agent = resolveAgentFromTeamBinding(agents, binding)
    const description = agent?.meta?.authoring?.description?.trim()

    const subscriptions: AssistantParticipantSubscriptions | undefined = binding.subscriptions
        ? {
            ...(binding.subscriptions.messagesFrom ? { messagesFrom: binding.subscriptions.messagesFrom } : {}),
            ...(binding.subscriptions.messageTags ? { messageTags: binding.subscriptions.messageTags } : {}),
            ...(binding.subscriptions.callboardKeys ? { callboardKeys: binding.subscriptions.callboardKeys } : {}),
            ...(binding.subscriptions.eventTypes ? { eventTypes: binding.subscriptions.eventTypes } : {}),
        }
        : undefined

    return {
        key: participantKey,
        agentName: agent?.name || binding?.displayName || (binding?.agentRef?.kind === 'registry'
            ? binding.agentRef.urn
            : binding?.agentRef?.draftId || participantKey),
        agentId: agent?.id || null,
        displayName: binding.displayName,
        ...(description ? { description } : {}),
        ...(subscriptions ? { subscriptions } : {}),
    }
}

function resolveTeamSummary(get: ChatGet, team: WorkspaceTeamSnapshot): AssistantWorkspaceTeamSummary {
    const participants = Object.entries(team.participants || {}).map(([key, binding]) =>
        resolveParticipantSummary(get, key, binding),
    )
    const relations: AssistantWorkspaceTeamRelationSummary[] = (team.relations || []).map((relation: TeamRelation) => ({
        id: relation.id,
        name: relation.name,
        description: relation.description,
        between: relation.between,
        direction: relation.direction,
    }))

    return {
        id: team.id,
        name: team.name,
        description: team.description,
        position: team.position,
        size: { width: team.width, height: team.height },
        hidden: !!team.hidden,
        teamRules: team.teamRules,
        safety: team.safety,
        participants,
        relations,
    }
}

export function isAssistantAgentId(chatKey: string): boolean {
    return isAssistantChatKey(chatKey)
}

export function buildAssistantWorkspaceContext(get: ChatGet): AssistantWorkspaceContext | null {
    const state = get()
    if (!state.workingDir) {
        return null
    }

    return {
        workingDir: state.workingDir,
        view: {
            selectedAgentId: state.selectedAgentId ?? null,
            selectedTeamId: state.selectedTeamId ?? null,
            selectedMarkdownEditorId: state.selectedMarkdownEditorId ?? null,
            activeChatAgentId: state.activeChatAgentId ?? null,
            viewMode: state.viewMode || 'canvas',
            panels: {
                packages: !!state.isPackageLibraryOpen,
                workspaceTracking: !!state.isTrackingOpen,
                terminal: !!state.isTerminalOpen,
                assistant: !!state.isAssistantOpen,
            },
        },
        agents: state.agents.map((agent) => {
            const description = agent.meta?.authoring?.description?.trim()
            return {
                id: agent.id,
                name: agent.name,
                ...(description ? { description } : {}),
                position: agent.position,
                size: {
                    width: agent.width ?? 400,
                    height: agent.height ?? 500,
                },
                hidden: !!agent.hidden,
                model: agent.model
                    ? {
                        provider: agent.model.provider,
                        modelId: agent.model.modelId,
                    }
                    : null,
                modelVariant: agent.modelVariant || null,
                skillUrns: agent.skillRefs
                    .filter((ref) => ref.kind === 'registry')
                    .map((ref) => ref.urn),
                skillDraftIds: agent.skillRefs
                    .filter((ref) => ref.kind === 'draft')
                    .map((ref) => ref.draftId),
            }
        }),
        teams: state.teams.map((team) => resolveTeamSummary(get, team)),
        drafts: Object.values(state.drafts)
            .filter((draft): draft is typeof draft & { kind: 'instruction' | 'skill' } =>
                draft.kind === 'instruction' || draft.kind === 'skill',
            )
            .map((draft) => ({
                id: draft.id,
                kind: draft.kind,
                name: draft.name,
                description: draft.description,
                tags: draft.tags,
                saveState: draft.saveState,
            })),
        availableModels: state.assistantAvailableModels.map((model) => ({
            provider: model.provider,
            providerName: model.providerName,
            modelId: model.modelId,
            name: model.name,
            ...(model.variants?.length
                ? {
                    variants: model.variants.map((variant) => ({
                        id: variant.id,
                        summary: variant.summary,
                    })),
                }
                : {}),
        })),
    }
}

export function resolveChatRuntimeTarget(get: ChatGet, chatKey: string): ResolvedChatRuntimeTarget | null {
    const state = get()
    const descriptor = describeChatTarget(chatKey)

    if (descriptor.kind === 'assistant') {
        return {
            chatKey,
            kind: 'assistant',
            name: 'APM Assistant',
            runtimeConfig: {
                ...EMPTY_RUNTIME_CONFIG,
                model: state.assistantModel
                    ? {
                        provider: state.assistantModel.provider,
                        modelId: state.assistantModel.modelId,
                    }
                    : null,
            },
            assistantContext: buildAssistantWorkspaceContext(get),
            executionScope: {
                agentId: null,
                teamId: null,
            },
            requestTarget: {
                agentId: chatKey,
                agentName: 'APM Assistant',
            },
        }
    }

    if (descriptor.kind === 'team-participant') {
        const team = state.teams.find((entry) => entry.id === descriptor.teamId) || null
        const binding = team?.participants[descriptor.participantKey]
        const participantName = binding?.displayName || descriptor.participantKey
        const agent = resolveAgentFromTeamBinding(state.agents, binding)

        if (!binding) {
            return {
                chatKey,
                kind: 'team-participant',
                name: participantName,
                runtimeConfig: EMPTY_RUNTIME_CONFIG,
                assistantContext: null,
                executionScope: {
                    agentId: null,
                    teamId: descriptor.teamId,
                },
                requestTarget: {
                    agentId: chatKey,
                    agentName: participantName,
                    teamId: descriptor.teamId,
                    teamThreadId: descriptor.threadId,
                },
                notice: `Team participant "${participantName}" is no longer available in this Team.`,
            }
        }

        if (!agent) {
            return {
                chatKey,
                kind: 'team-participant',
                name: participantName,
                runtimeConfig: EMPTY_RUNTIME_CONFIG,
                assistantContext: null,
                executionScope: {
                    agentId: null,
                    teamId: descriptor.teamId,
                },
                requestTarget: {
                    agentId: chatKey,
                    agentName: participantName,
                    teamId: descriptor.teamId,
                    teamThreadId: descriptor.threadId,
                },
                notice:
                    `Cannot resolve agent for participant "${participantName}" ` +
                    `(ref: ${describeTeamParticipantRef(binding, descriptor.participantKey)}). ` +
                    'No matching local agent found. Try re-importing the Team or creating an agent manually.',
            }
        }

        return {
            chatKey,
            kind: 'team-participant',
            name: agent.name || participantName,
            runtimeConfig: resolveAgentRuntimeConfig(agent),
            assistantContext: null,
            executionScope: {
                agentId: agent.id,
                teamId: descriptor.teamId,
            },
            requestTarget: {
                agentId: chatKey,
                agentName: agent.name || participantName,
                teamId: descriptor.teamId,
                teamThreadId: descriptor.threadId,
            },
        }
    }

    const agent = state.agents.find((item) => item.id === descriptor.agentId) || null
    if (!agent) {
        return null
    }

    return {
        chatKey,
        kind: 'agent',
        name: agent.name || 'Untitled Agent',
        runtimeConfig: resolveAgentRuntimeConfig(agent),
        assistantContext: null,
        executionScope: {
            agentId: agent.id,
            teamId: null,
        },
        requestTarget: {
            agentId: agent.id,
            agentName: agent.name || 'Untitled Agent',
        },
    }
}
