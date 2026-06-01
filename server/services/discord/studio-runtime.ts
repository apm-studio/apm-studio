import type { TeamThreadSummary } from '../../../shared/team-types.js'
import { buildTeamParticipantChatKey } from '../../../shared/chat-targets.js'
import type {
    ChatQuestionAnswer,
    ChatSendRequest,
} from '../../../shared/chat-contracts.js'
import type {
    WorkspaceAgentSnapshot,
    WorkspaceSnapshot,
    WorkspaceTeamSnapshot,
} from '../../../shared/workspace-contracts.js'
import { buildTeamDefinition, resolveAgentFromTeamBindingInput } from '../../../shared/team-definition-builder.js'
import {
    buildAgentConfigHash,
    resolveAgentRuntimeConfig,
    type AgentRuntimeConfigInput,
} from '../../../shared/runtime-config.js'
import {
    listStudioSessionMessages,
    rejectQuestion,
    respondQuestion,
    respondSessionPermission,
} from '../chat/session-service.js'
import { createStudioChatSession, sendStudioChatMessage } from '../chat/message-service.js'
import { getTeamRuntimeService } from '../team-runtime/team-runtime-service.js'
import {
    formatDiscordBackfillMessages,
    latestAssistantMessage,
} from './discord-session-messages.js'
export {
    describeDiscordSessionBlock,
    findPendingStudioInteraction,
    isDiscordSessionRunning,
    waitForAssistantReply,
    type DiscordAssistantReply,
    type DiscordSessionBlock,
} from './discord-session-state.js'

export {
    formatDiscordBackfillMessages,
    type DiscordBackfillMessage,
} from './discord-session-messages.js'
export {
    listStandaloneThreadsForDiscord,
    type DiscordStandaloneThreadSummary,
} from './discord-standalone-threads.js'

export type DiscordAgentSnapshot = WorkspaceAgentSnapshot & AgentRuntimeConfigInput
export type DiscordTeamSnapshot = WorkspaceTeamSnapshot
export type DiscordWorkspaceSnapshot = WorkspaceSnapshot & {
    workingDir: string
    agents?: DiscordAgentSnapshot[]
    teams?: DiscordTeamSnapshot[]
}

export function findWorkspaceAgent(snapshot: DiscordWorkspaceSnapshot, agentId: string) {
    return (snapshot.agents || []).find((agent) => agent.id === agentId) || null
}

export function findWorkspaceTeam(snapshot: DiscordWorkspaceSnapshot, teamId: string) {
    return (snapshot.teams || []).find((team) => team.id === teamId) || null
}

export function resolveTeamParticipantAgent(
    snapshot: DiscordWorkspaceSnapshot,
    team: DiscordTeamSnapshot,
    participantKey: string,
) {
    const binding = team.participants?.[participantKey]
    return resolveAgentFromTeamBindingInput(snapshot.agents || [], binding) as DiscordAgentSnapshot | null
}

export function buildDiscordTeamDefinition(team: DiscordTeamSnapshot, snapshot: DiscordWorkspaceSnapshot) {
    return buildTeamDefinition(team, snapshot.agents || [])
}

export async function listDiscordBackfillMessages(params: {
    workingDir: string
    sessionId: string
    assistantLabel: string
    knownMessageIds?: string[]
    limit?: number
    includeUserMessages?: boolean
}) {
    const result = await listStudioSessionMessages(params.workingDir, params.sessionId, { limit: 80 })
    return formatDiscordBackfillMessages({
        sessionId: params.sessionId,
        assistantLabel: params.assistantLabel,
        messages: result.messages,
        knownMessageIds: params.knownMessageIds,
        limit: params.limit,
        includeUserMessages: params.includeUserMessages,
    })
}

export async function getLatestDiscordAssistantMessageId(workingDir: string, sessionId: string) {
    const result = await listStudioSessionMessages(workingDir, sessionId)
    return latestAssistantMessage(result.messages)?.id || null
}

export async function respondDiscordPermission(params: {
    workingDir: string
    sessionId: string
    permissionId: string
    response: 'once' | 'always' | 'reject'
}) {
    return respondSessionPermission(params.workingDir, params.sessionId, params.permissionId, params.response)
}

export async function respondDiscordQuestion(workingDir: string, questionId: string, answers: ChatQuestionAnswer[]) {
    return respondQuestion(workingDir, questionId, answers)
}

export async function rejectDiscordQuestion(workingDir: string, questionId: string) {
    return rejectQuestion(workingDir, questionId)
}

export async function ensureStandaloneSession(params: {
    workingDir: string
    agent: DiscordAgentSnapshot
    sessionId?: string
}) {
    if (params.sessionId) {
        return params.sessionId
    }
    const session = await createStudioChatSession(params.workingDir, {
        agentId: params.agent.id,
        agentName: params.agent.name,
        configHash: buildAgentConfigHash(params.agent),
    })
    return session.sessionId
}

export async function ensureTeamParticipantSession(params: {
    workingDir: string
    teamId: string
    thread: TeamThreadSummary
    participantKey: string
    agent: DiscordAgentSnapshot
}) {
    const existing = params.thread.participantSessions?.[params.participantKey]
    if (existing) {
        return existing
    }
    const chatKey = buildTeamParticipantChatKey(params.teamId, params.thread.id, params.participantKey)
    const session = await createStudioChatSession(params.workingDir, {
        agentId: chatKey,
        agentName: params.agent.name,
        configHash: buildAgentConfigHash(params.agent),
        teamId: params.teamId,
    })
    return session.sessionId
}

export async function sendAgentDiscordMessage(params: {
    workingDir: string
    sessionId: string
    agent: DiscordAgentSnapshot
    message: string
}) {
    const runtimeConfig = resolveAgentRuntimeConfig(params.agent)
    await sendStudioChatMessage(params.workingDir, params.sessionId, {
        message: params.message,
        agent: {
            agentId: params.agent.id,
            agentName: params.agent.name,
            skillRefs: runtimeConfig.skillRefs,
            model: runtimeConfig.model,
            modelVariant: runtimeConfig.modelVariant,
            runtimeAgentId: runtimeConfig.runtimeAgentId,
            mcpServerNames: runtimeConfig.mcpServerNames,
            planMode: runtimeConfig.planMode,
            configHash: buildAgentConfigHash(params.agent),
        },
    } satisfies ChatSendRequest)
}

export async function sendTeamParticipantDiscordMessage(params: {
    workingDir: string
    sessionId: string
    teamId: string
    threadId: string
    participantKey: string
    agent: DiscordAgentSnapshot
    message: string
}) {
    const runtimeConfig = resolveAgentRuntimeConfig(params.agent)
    const chatKey = buildTeamParticipantChatKey(params.teamId, params.threadId, params.participantKey)
    await sendStudioChatMessage(params.workingDir, params.sessionId, {
        message: params.message,
        agent: {
            agentId: chatKey,
            agentName: params.agent.name,
            skillRefs: runtimeConfig.skillRefs,
            model: runtimeConfig.model,
            modelVariant: runtimeConfig.modelVariant,
            runtimeAgentId: runtimeConfig.runtimeAgentId,
            mcpServerNames: runtimeConfig.mcpServerNames,
            planMode: runtimeConfig.planMode,
            configHash: buildAgentConfigHash(params.agent),
        },
        teamId: params.teamId,
        teamThreadId: params.threadId,
    } satisfies ChatSendRequest)
}

export async function listTeamThreadsForDiscord(workingDir: string, teamId: string) {
    return getTeamRuntimeService(workingDir).listThreads(teamId)
}

export async function createTeamThreadForDiscord(workingDir: string, team: DiscordTeamSnapshot, snapshot: DiscordWorkspaceSnapshot) {
    return getTeamRuntimeService(workingDir).createThread(team.id, buildDiscordTeamDefinition(team, snapshot))
}
