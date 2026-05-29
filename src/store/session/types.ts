import type { ChatMessage } from './chat-message-types'
/**
 * Normalized session data structures keyed by sessionId.
 */

import type { ChatPermissionRequest, ChatQuestionRequest, ChatTodo } from '../../../shared/chat-contracts'

// ── Session Status ──

export type SessionStatusType = 'idle' | 'busy' | 'error' | 'retry'

export interface SessionStatus {
    type: SessionStatusType
    attempt?: number
    message?: string
}

// ── Session Entity ──

export interface SessionEntity {
    id: string
    title?: string
    createdAt?: number
    updatedAt?: number
    parentId?: string | null
    status: SessionStatus
}

// ── Session Entity Store Shape ──

export interface SessionEntityState {
    /** sessionId → SessionEntity metadata */
    seEntities: Record<string, SessionEntity>

    /** sessionId → ChatMessage[] (full message list for that session) */
    seMessages: Record<string, ChatMessage[]>

    /** sessionId → SessionStatus (live streaming status) */
    seStatuses: Record<string, SessionStatus>

    /** sessionId → pending permission request */
    sePermissions: Record<string, ChatPermissionRequest>

    /** sessionId → pending question request */
    seQuestions: Record<string, ChatQuestionRequest>

    /** sessionId → todo list */
    seTodos: Record<string, ChatTodo[]>

    /**
     * chatKey → local draft/placeholder messages shown when no bound session
     * exists yet (for example optimistic pre-create messages or detached views).
     */
    chatDrafts: Record<string, ChatMessage[]>

    /**
     * chatKey → local system prefix messages shown ahead of server-backed
     * session history.
     */
    chatPrefixes: Record<string, ChatMessage[]>

    /**
     * Bidirectional index: chatKey ↔ sessionId.
     *
     * chatKey is:
     *   - agentId for standalone agents
     *   - `team:{teamId}:thread:{threadId}:participant:{key}` for Team participants
     *   - ASSISTANT_AGENT_ID for assistant
     */
    chatKeyToSession: Record<string, string>
    sessionToChatKey: Record<string, string>

    /** Per-session optimistic transport bridge until concrete status arrives. */
    sessionLoading: Record<string, boolean>

    /** Per-session local mutation state for undo/revert/restore style operations. */
    sessionMutationPending: Record<string, boolean>

    /** OpenCode revert state: hide rolled-back messages until restored or next prompt cleanup */
    sessionReverts: Record<string, { messageId: string; partId?: string }>
}

// ── Session Entity Slice (actions) ──

export interface SessionEntityActions {
    // Entity CRUD
    upsertSession: (session: SessionEntity) => void
    removeSession: (sessionId: string) => void

    // Message management
    setSessionMessages: (sessionId: string, messages: ChatMessage[]) => void
    appendSessionMessage: (sessionId: string, message: ChatMessage) => void
    removeSessionMessage: (sessionId: string, messageId: string) => void
    upsertMessageById: (sessionId: string, messageId: string, updater: (msg: ChatMessage) => ChatMessage) => void

    // Status
    setSessionStatus: (sessionId: string, status: SessionStatus) => void
    setSessionLoading: (sessionId: string, loading: boolean) => void
    setSessionMutationPending: (sessionId: string, pending: boolean) => void

    // Dock state
    setSessionPermission: (sessionId: string, permission: ChatPermissionRequest) => void
    clearSessionPermission: (sessionId: string) => void
    setSessionQuestion: (sessionId: string, question: ChatQuestionRequest) => void
    clearSessionQuestion: (sessionId: string) => void
    setSessionTodos: (sessionId: string, todos: ChatTodo[]) => void

    // Local chatKey-scoped view state
    setChatDraftMessages: (chatKey: string, messages: ChatMessage[]) => void
    appendChatDraftMessage: (chatKey: string, message: ChatMessage) => void
    removeChatDraftMessage: (chatKey: string, messageId: string) => void
    clearChatDraftMessages: (chatKey: string) => void
    setChatPrefixMessages: (chatKey: string, messages: ChatMessage[]) => void
    appendChatPrefixMessage: (chatKey: string, message: ChatMessage) => void
    clearChatPrefixMessages: (chatKey: string) => void

    // Binding index
    registerBinding: (chatKey: string, sessionId: string) => void
    unregisterBinding: (chatKey: string) => void
    unregisterBindingBySession: (sessionId: string) => void

    // Revert state
    setSessionRevert: (sessionId: string, revert: { messageId: string; partId?: string }) => void
    clearSessionRevert: (sessionId: string) => void

    // Bulk clear
    clearSessionData: (sessionId: string) => void
}

export type SessionSlice = SessionEntityState & SessionEntityActions
