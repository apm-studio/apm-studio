import type { ChatQuestionAnswer, ChatSessionDiffEntry, SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { ChatMessage } from '../session/chat-message-types'

export interface ChatSlice {
    activeChatAgentId: string | null
    sessions: Array<{ id: string; title?: string; sidebarTitle?: string; createdAt?: number; updatedAt?: number }>

    setActiveChatAgent: (agentId: string | null) => void
    addChatMessage: (chatKey: string, msg: ChatMessage) => void
    sendMessage: (
        chatKey: string,
        message: string,
        attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>,
        extraSkillRefs?: SharedPrimitiveRef[],
    ) => Promise<void>
    sendTeamMessage: (
        teamId: string,
        threadId: string,
        participantKey: string,
        message: string,
    ) => Promise<void>
    clearSession: (chatKey: string) => void
    startNewSession: (chatKey: string) => Promise<void>
    abortChat: (chatKey: string) => Promise<void>
    undoLastTurn: (chatKey: string) => Promise<void>
    rehydrateSessions: () => Promise<void>
    revertSession: (chatKey: string, messageId: string) => Promise<void>
    restoreRevertedMessage: (chatKey: string, messageId: string) => Promise<void>
    getDiff: (chatKey: string) => Promise<ChatSessionDiffEntry[]>
    listSessions: () => Promise<void>
    deleteSession: (sessionId: string) => Promise<void>
    detachAgentSession: (chatKey: string, notice?: string) => void

    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
    respondToQuestion: (sessionId: string, questionId: string, answers: ChatQuestionAnswer[]) => Promise<void>
    rejectQuestion: (sessionId: string, questionId: string) => Promise<void>
}
