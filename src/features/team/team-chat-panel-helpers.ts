import type { ChatMessage } from '../../store/session/chat-message-types'
import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import type { ChatPermissionRequest, ChatQuestionRequest } from '../../../shared/chat-contracts'
import { buildTeamParticipantChatKey } from '../../../shared/chat-targets'
import { resolveTeamParticipantAgent as resolveParticipantAgent } from '../../lib/team-participants'
import type { TeamThreadState } from '../../store/team/types'

import { resolveSessionActivity } from '../../store/session/session-activity'
import type { SessionStatus } from '../../store/session/types'

export type ParticipantExecutionState = {
    loading: boolean
    status: SessionStatus | null | undefined
    messages: ChatMessage[]
    permission?: ChatPermissionRequest | null
    question?: ChatQuestionRequest | null
}

export type TeamChatComposerState = {
    composerDisabled: boolean
    sendDisabled: boolean
    inputPlaceholder: string
}

export function resolveActiveTeamParticipantKey(
    participantKeys: string[],
    currentThreadId: string | null,
    activeThreadParticipantKey: string | null,
) {
    const isCallboardView = !!currentThreadId && activeThreadParticipantKey === null
    const activeParticipantKey = isCallboardView ? null : activeThreadParticipantKey || participantKeys[0] || null

    return {
        isCallboardView,
        activeParticipantKey,
    }
}

export function buildActiveTeamParticipantChatKey(
    teamId: string,
    threadId: string | null,
    participantKey: string | null,
) {
    if (!threadId || !participantKey) {
        return null
    }

    return buildTeamParticipantChatKey(teamId, threadId, participantKey)
}

export function moveParticipantKey(keys: string[], activeKey: string, overKey: string) {
    const activeIndex = keys.indexOf(activeKey)
    const overIndex = keys.indexOf(overKey)

    if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
        return keys
    }

    const nextKeys = [...keys]
    const [movedKey] = nextKeys.splice(activeIndex, 1)
    nextKeys.splice(overIndex, 0, movedKey)
    return nextKeys
}

export function buildTeamParticipantLoadingStates(params: {
    currentThread: TeamThreadState | null
    participantKeys: string[]
    executionStatesByParticipant?: Record<string, ParticipantExecutionState | null | undefined>
}) {
    const {
        currentThread,
        participantKeys,
        executionStatesByParticipant,
    } = params
    if (!currentThread) {
        return new Map<string, boolean>()
    }

    return new Map(
        participantKeys.map((participantKey) => {
            const executionState = executionStatesByParticipant?.[participantKey]
            if (executionState) {
                return [participantKey, resolveSessionActivity(executionState).isActive]
            }

            const status = currentThread.participantStatuses?.[participantKey]?.type
            return [participantKey, status === 'busy']
        }),
    )
}

export function buildTeamParticipantExecutionStates(params: {
    currentThread: TeamThreadState | null
    participantKeys: string[]
    sessionLoadingById: Record<string, boolean | undefined>
    sessionStatusesById: Record<string, SessionStatus | undefined>
    sessionMessagesById: Record<string, ChatMessage[] | undefined>
    sessionPermissionsById: Record<string, ChatPermissionRequest | undefined>
    sessionQuestionsById: Record<string, ChatQuestionRequest | undefined>
}) {
    const {
        currentThread,
        participantKeys,
        sessionLoadingById,
        sessionStatusesById,
        sessionMessagesById,
        sessionPermissionsById,
        sessionQuestionsById,
    } = params

    return Object.fromEntries(
        participantKeys.map((participantKey) => {
            const participantSessionId = currentThread?.participantSessions?.[participantKey]
            if (!participantSessionId) {
                return [participantKey, null]
            }

            return [participantKey, {
                loading: !!sessionLoadingById[participantSessionId],
                status: sessionStatusesById[participantSessionId],
                messages: sessionMessagesById[participantSessionId] || [],
                permission: sessionPermissionsById[participantSessionId] || null,
                question: sessionQuestionsById[participantSessionId] || null,
            }]
        }),
    ) as Record<string, ParticipantExecutionState | null>
}

export function buildTeamChatComposerState(params: {
    input: string
    noParticipants: boolean
    readinessRunnable: boolean
    hasCurrentThread: boolean
    modelConfigured: boolean
    isLoading: boolean
    activeParticipantLabel: string | null
    activeParticipantKey: string | null
}): TeamChatComposerState {
    const {
        input,
        noParticipants,
        readinessRunnable,
        hasCurrentThread,
        modelConfigured,
        isLoading,
        activeParticipantLabel,
        activeParticipantKey,
    } = params

    let inputPlaceholder = `Message ${activeParticipantLabel ?? activeParticipantKey ?? 'participant'}...`
    if (noParticipants) {
        inputPlaceholder = 'Add agents first...'
    } else if (!readinessRunnable) {
        inputPlaceholder = 'Resolve readiness issues first...'
    } else if (!hasCurrentThread) {
        inputPlaceholder = 'Create a thread to start...'
    } else if (!modelConfigured) {
        inputPlaceholder = 'Configure a model for this agent...'
    }

    return {
        composerDisabled: noParticipants || !readinessRunnable || !hasCurrentThread || !modelConfigured || isLoading,
        sendDisabled: !input.trim() || noParticipants || !readinessRunnable || !hasCurrentThread || !modelConfigured,
        inputPlaceholder,
    }
}

export function resolveTeamParticipantAgent(
    team: WorkspaceTeamSnapshot | null | undefined,
    participantKey: string | null,
    agents: WorkspaceAgentNode[],
) {
    return resolveParticipantAgent(team, participantKey, agents)
}
