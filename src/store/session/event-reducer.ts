import type { ChatMessageToolInfo } from './chat-message-types'
/**
 * Event Reducer — Phase 2
 *
 * Pure reducer functions that apply SSE events to the session entity store.
 * Replaces integration-message-handlers.ts and integration-session-handlers.ts.
 *
 * Each handler reads/writes via the SessionSlice actions rather than
 * module-level Maps.
 */
import type { StudioState } from '../types'
import type { SessionStatus } from './types'

import type { ChatPermissionRequest, ChatQuestionRequest, ChatTodo } from '../../../shared/chat-contracts'
import {
    mapSessionEventMessagePart,
    type SessionEventMessagePart,
} from './event-message-parts'
import {
    applyMessagePartDelta,
    finalizeStaleToolPartsAsError,
    patchToolCallStatusByCallId,
    removeMessagePartFromMessages,
    upsertMessageEnvelope,
    upsertMessagePart,
} from './event-message-state'
import {
    buildSessionErrorMessage,
    removeRetryMessage,
    upsertRetryMessage,
} from './event-status-state'

// ── Shared types ──

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
    const next = { ...record }
    delete next[key]
    return next
}

/** Resolve sessionId → sessionId (confirmed it exists in entity store). */
function hasSession(state: StudioState, sessionId: string): boolean {
    return !!(state.sessionToChatKey[sessionId] || state.seEntities[sessionId] || state.seMessages[sessionId])
}

// ── Message Reducers ──

export function reduceMessageUpdated(
    sessionId: string,
    messageId: string,
    role: string,
    createdAt: number | undefined,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []
    const updated = upsertMessageEnvelope(
        messages,
        messageId,
        role === 'user' || role === 'assistant' || role === 'system' ? role : 'assistant',
        createdAt || Date.now(),
    )
    set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
}

export function reduceMessageRemoved(
    sessionId: string,
    messageId: string,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []
    set({
        seMessages: {
            ...state.seMessages,
            [sessionId]: messages.filter((m) => m.id !== messageId),
        },
    })
}

export function reduceMessagePartUpdated(
    sessionId: string,
    messageId: string,
    part: SessionEventMessagePart,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []
    const messagePart = mapSessionEventMessagePart(part)
    if (!messagePart) return
    const updated = upsertMessagePart(messages, messageId, messagePart)
    set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
}

export function reduceMessagePartDelta(
    sessionId: string,
    messageId: string,
    partId: string,
    field: string,
    delta: string,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []
    const updated = applyMessagePartDelta(messages, messageId, partId, field, delta)
    if (!updated) return
    set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
}

export function reduceMessagePartRemoved(
    sessionId: string,
    messageId: string,
    partId: string,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const messages = state.seMessages[sessionId] || []
    const updated = removeMessagePartFromMessages(messages, messageId, partId)
    set({ seMessages: { ...state.seMessages, [sessionId]: updated } })
}

export function reduceToolCallStatusByCallId(
    sessionId: string,
    callId: string,
    patch: Partial<ChatMessageToolInfo>,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId) || !callId) return

    const messages = state.seMessages[sessionId] || []
    const { messages: nextMessages, changed } = patchToolCallStatusByCallId(messages, callId, patch)

    if (changed) {
        set({ seMessages: { ...state.seMessages, [sessionId]: nextMessages } })
    }
}

// ── Session Status Reducers ──

export function reduceSessionStatus(
    sessionId: string,
    status: SessionStatus,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    set({
        seStatuses: { ...state.seStatuses, [sessionId]: status },
        sessionLoading: withoutKey(state.sessionLoading, sessionId),
    })

    if (status.type === 'busy' || status.type === 'idle') {
        const messages = get().seMessages[sessionId] || []
        const nextMessages = removeRetryMessage(messages, sessionId)
        if (nextMessages !== messages) {
            set({
                seMessages: {
                    ...get().seMessages,
                    [sessionId]: nextMessages,
                },
            })
        }
    }

    if (status.type === 'retry') {
        const messages = get().seMessages[sessionId] || []
        set({ seMessages: { ...get().seMessages, [sessionId]: upsertRetryMessage(messages, sessionId, status) } })
    }
}

export function reduceSessionError(
    sessionId: string,
    errorMessage: string,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const restLoading = withoutKey(state.sessionLoading, sessionId)
    set({
        sessionLoading: restLoading,
        seStatuses: { ...state.seStatuses, [sessionId]: { type: 'error', message: errorMessage } },
    })

    const messages = get().seMessages[sessionId] || []
    const finalized = finalizeStaleToolPartsAsError(messages)

    set({
        seMessages: {
            ...get().seMessages,
            [sessionId]: [
                ...finalized,
                buildSessionErrorMessage(errorMessage),
            ],
        },
    })
}

// ── Permission / Question / Todo Reducers ──

export function reducePermissionAsked(
    sessionId: string,
    permission: ChatPermissionRequest,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const restLoading = withoutKey(state.sessionLoading, sessionId)
    set({
        sePermissions: { ...state.sePermissions, [sessionId]: permission },
        sessionLoading: restLoading,
    })
}

export function reducePermissionReplied(
    sessionId: string,
    _get: GetFn,
    set: SetFn,
) {
    set((state) => {
        return { sePermissions: withoutKey(state.sePermissions, sessionId) }
    })
}

export function reduceQuestionAsked(
    sessionId: string,
    question: ChatQuestionRequest,
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    if (!hasSession(state, sessionId)) return

    const restLoading = withoutKey(state.sessionLoading, sessionId)
    set({
        seQuestions: { ...state.seQuestions, [sessionId]: question },
        sessionLoading: restLoading,
    })
}

export function reduceQuestionReplied(
    sessionId: string,
    _get: GetFn,
    set: SetFn,
) {
    set((state) => {
        return { seQuestions: withoutKey(state.seQuestions, sessionId) }
    })
}

export function reduceTodoUpdated(
    sessionId: string,
    todos: ChatTodo[],
    get: GetFn,
    set: SetFn,
) {
    const state = get()
    set({
        seTodos: {
            ...state.seTodos,
            [sessionId]: todos,
        },
    })
}
