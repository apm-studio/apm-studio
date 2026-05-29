import type { ChatSendRequest } from '../../../shared/chat-contracts.js'
import { deriveProvisionalThreadTitle } from '../../../shared/session-metadata.js'
import {
    maybeGenerateTeamThreadName,
    maybeGenerateStandaloneSessionTitle,
    sessionHasUserMessages,
    setInitialTeamThreadName,
    setInitialStandaloneSessionTitle,
} from './thread-title-service.js'

export type ChatThreadTitlePlan = {
    shouldGenerateThreadTitle: boolean
    provisionalTitle: string | null
}

export async function seedInitialChatThreadTitle(input: {
    workingDir: string
    sessionId: string
    request: ChatSendRequest
    isAssistant: boolean
}): Promise<ChatThreadTitlePlan> {
    const {
        workingDir,
        sessionId,
        request,
        isAssistant,
    } = input
    const shouldGenerateThreadTitle = !isAssistant
        && request.message.trim().length > 0
        && !(await sessionHasUserMessages(workingDir, sessionId).catch(() => true))
    const provisionalTitle = shouldGenerateThreadTitle
        ? deriveProvisionalThreadTitle(request.message)
        : null

    if (!shouldGenerateThreadTitle || !provisionalTitle) {
        return { shouldGenerateThreadTitle, provisionalTitle }
    }

    if (request.teamId && request.teamThreadId) {
        await setInitialTeamThreadName({
            workingDir,
            teamId: request.teamId,
            threadId: request.teamThreadId,
            provisionalTitle,
        }).catch((error) => {
            console.warn(`[chat-message-service] Failed to seed Team thread name for ${request.teamThreadId}:`, error)
        })
    } else {
        await setInitialStandaloneSessionTitle({
            sessionId,
            provisionalTitle,
        }).catch((error) => {
            console.warn(`[chat-message-service] Failed to seed standalone thread title for ${sessionId}:`, error)
        })
    }

    return { shouldGenerateThreadTitle, provisionalTitle }
}

export function scheduleGeneratedChatThreadTitle(input: {
    workingDir: string
    sessionId: string
    request: ChatSendRequest
    titlePlan: ChatThreadTitlePlan
}) {
    const {
        workingDir,
        sessionId,
        request,
        titlePlan,
    } = input
    if (!titlePlan.shouldGenerateThreadTitle || !request.agent.model) {
        return
    }

    if (request.teamId && request.teamThreadId) {
        void maybeGenerateTeamThreadName({
            workingDir,
            teamId: request.teamId,
            threadId: request.teamThreadId,
            message: request.message,
            model: {
                providerId: request.agent.model.provider,
                modelId: request.agent.model.modelId,
            },
            provisionalTitle: titlePlan.provisionalTitle,
        }).catch((error) => {
            console.warn(`[chat-message-service] Failed to generate Team thread name for ${request.teamThreadId}:`, error)
        })
    } else {
        void maybeGenerateStandaloneSessionTitle({
            workingDir,
            sessionId,
            message: request.message,
            model: {
                providerId: request.agent.model.provider,
                modelId: request.agent.model.modelId,
            },
            provisionalTitle: titlePlan.provisionalTitle,
        }).catch((error) => {
            console.warn(`[chat-message-service] Failed to generate standalone thread title for ${sessionId}:`, error)
        })
    }
}
