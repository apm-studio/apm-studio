import type { ChatMessageToolInfo } from './chat-message-types'
import type { ChatPermissionRequest, ChatQuestionRequest, ChatTodo } from '../../../shared/chat-contracts'
import {
    normalizeChatPermissionRequest,
    normalizeChatQuestionRequest,
    normalizeChatTodos,
} from '../../../shared/chat-interactions'

import type { SessionStatus } from './types'
import type { SessionEventMessagePart } from './event-message-parts'

export interface SSEEvent {
    type?: string
    properties?: Record<string, unknown>
}

type SessionIdPayload = {
    sessionId: string
}

type MessageIdPayload = SessionIdPayload & {
    messageId: string
}

type ToolPatchPayload = SessionIdPayload & {
    callId: string
    patch: Partial<ChatMessageToolInfo>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null
}

function readString(record: Record<string, unknown> | null | undefined, key: string): string | undefined {
    const value = record?.[key]
    return typeof value === 'string' && value ? value : undefined
}

function readNumber(record: Record<string, unknown> | null | undefined, key: string): number | undefined {
    const value = record?.[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readSessionId(record: unknown): string | undefined {
    const typed = readRecord(record)
    return readString(typed, 'sessionID')
}

export function readMessageId(record: unknown): string | undefined {
    const typed = readRecord(record)
    return readString(typed, 'messageID')
}

export function readPartId(record: unknown): string | undefined {
    const typed = readRecord(record)
    return readString(typed, 'partID')
}

export function readMessageUpdatedPayload(props: unknown): (MessageIdPayload & {
    role: string
    createdAt?: number
}) | null {
    const info = readRecord(readRecord(props)?.info)
    const sessionId = readSessionId(info)
    const messageId = readString(info, 'id')
    const role = readString(info, 'role')
    if (!sessionId || !messageId || !role) return null
    const time = readRecord(info?.time)
    return {
        sessionId,
        messageId,
        role,
        createdAt: readNumber(time, 'created'),
    }
}

export function readMessageRemovedPayload(props: unknown): MessageIdPayload | null {
    const sessionId = readSessionId(props)
    const messageId = readMessageId(props)
    return sessionId && messageId ? { sessionId, messageId } : null
}

export function readMessagePartUpdatedPayload(props: unknown): (MessageIdPayload & {
    part: SessionEventMessagePart
}) | null {
    const part = readRecord(readRecord(props)?.part)
    const sessionId = readSessionId(part)
    const messageId = readMessageId(part)
    const id = readString(part, 'id')
    if (!sessionId || !messageId || !id) return null

    const state = readRecord(part?.state)
    return {
        sessionId,
        messageId,
        part: {
            id,
            type: readString(part, 'type'),
            text: readString(part, 'text'),
            tool: readString(part, 'tool'),
            callID: readString(part, 'callID'),
            state: state
                ? {
                    status: readString(state, 'status') as SessionEventMessagePart['state'] extends infer State
                        ? State extends { status?: infer Status } ? Status : never
                        : never,
                    title: readString(state, 'title'),
                    input: state.input,
                    metadata: state.metadata,
                    output: state.output,
                    error: state.error,
                    time: readRecord(state.time) || undefined,
                }
                : undefined,
            reason: readString(part, 'reason'),
            cost: part?.cost,
            tokens: part?.tokens,
            auto: typeof part?.auto === 'boolean' ? part.auto : undefined,
            overflow: part?.overflow,
        },
    }
}

export function readMessagePartDeltaPayload(props: unknown): (MessageIdPayload & {
    partId: string
    field: string
    delta: string
}) | null {
    const sessionId = readSessionId(props)
    const messageId = readMessageId(props)
    const partId = readPartId(props)
    const record = readRecord(props)
    const field = readString(record, 'field')
    const delta = readString(record, 'delta')
    return sessionId && messageId && partId && field && delta !== undefined
        ? { sessionId, messageId, partId, field, delta }
        : null
}

export function readMessagePartRemovedPayload(props: unknown): (MessageIdPayload & {
    partId: string
}) | null {
    const sessionId = readSessionId(props)
    const messageId = readMessageId(props)
    const partId = readPartId(props)
    return sessionId && messageId && partId ? { sessionId, messageId, partId } : null
}

function readStatusType(value: unknown): SessionStatus['type'] | null {
    return value === 'idle' || value === 'busy' || value === 'error' || value === 'retry'
        ? value
        : null
}

export function readSessionStatusPayload(props: unknown): (SessionIdPayload & {
    status: SessionStatus
}) | null {
    const record = readRecord(props)
    const sessionId = readSessionId(record)
    const statusRecord = readRecord(record?.status)
    const type = readStatusType(statusRecord?.type)
    if (!sessionId || !type) return null
    return {
        sessionId,
        status: {
            type,
            attempt: readNumber(statusRecord, 'attempt'),
            message: readString(statusRecord, 'message'),
        },
    }
}

export function readSessionOnlyPayload(props: unknown): SessionIdPayload | null {
    const sessionId = readSessionId(props)
    return sessionId ? { sessionId } : null
}

export function readSessionErrorPayload(props: unknown): (SessionIdPayload & {
    message: string
}) | null {
    const sessionId = readSessionId(props)
    return sessionId ? { sessionId, message: extractErrorMessage(readRecord(props)?.error) } : null
}

export function readToolFailedPayload(props: unknown): ToolPatchPayload | null {
    const record = readRecord(props)
    const sessionId = readSessionId(record)
    const callId = readString(record, 'callID')
    if (!sessionId || !callId) return null
    return {
        sessionId,
        callId,
        patch: {
            status: 'error',
            error: extractErrorMessage(record?.error),
        },
    }
}

export function readToolSuccessPayload(props: unknown): ToolPatchPayload | null {
    const record = readRecord(props)
    const sessionId = readSessionId(record)
    const callId = readString(record, 'callID')
    if (!record || !sessionId || !callId) return null
    const metadata = readRecord(readRecord(record?.provider)?.metadata) || undefined
    return {
        sessionId,
        callId,
        patch: {
            status: 'completed',
            output: extractToolEventOutput(record),
            metadata,
        },
    }
}

export function readShellStartedPayload(props: unknown): ToolPatchPayload | null {
    const record = readRecord(props)
    const sessionId = readSessionId(record)
    const callId = readString(record, 'callID')
    if (!sessionId || !callId) return null
    const command = readString(record, 'command')
    return {
        sessionId,
        callId,
        patch: {
            status: 'running',
            input: command ? { command } : undefined,
        },
    }
}

export function readShellEndedPayload(props: unknown): ToolPatchPayload | null {
    const record = readRecord(props)
    const sessionId = readSessionId(record)
    const callId = readString(record, 'callID')
    if (!sessionId || !callId) return null
    return {
        sessionId,
        callId,
        patch: {
            status: 'completed',
            output: readString(record, 'output'),
        },
    }
}

export function readSessionRetriedPayload(props: unknown): (SessionIdPayload & {
    status: SessionStatus
}) | null {
    const record = readRecord(props)
    const sessionId = readSessionId(record)
    if (!sessionId) return null
    return {
        sessionId,
        status: {
            type: 'retry',
            attempt: readNumber(record, 'attempt'),
            message: extractErrorMessage(record?.error),
        },
    }
}

export function readPermissionAskedPayload(props: unknown): (SessionIdPayload & {
    request: ChatPermissionRequest
}) | null {
    const request = normalizeChatPermissionRequest(props)
    return request ? { sessionId: request.sessionId, request } : null
}

export function readQuestionAskedPayload(props: unknown): (SessionIdPayload & {
    request: ChatQuestionRequest
}) | null {
    const request = normalizeChatQuestionRequest(props)
    return request ? { sessionId: request.sessionId, request } : null
}

export function readTodoUpdatedPayload(props: unknown): (SessionIdPayload & {
    todos: ChatTodo[]
}) | null {
    const record = readRecord(props)
    const sessionId = readSessionId(record)
    const todos = normalizeChatTodos(record?.todos)
    return sessionId
        ? { sessionId, todos }
        : null
}

export function extractErrorMessage(error: unknown): string {
    const errorRecord = readRecord(error)
    const dataRecord = readRecord(errorRecord?.data)
    const name = readString(errorRecord, 'name') || readString(errorRecord, 'type') || ''
    if (typeof dataRecord?.message === 'string' && dataRecord.message.trim()) {
        return appendErrorContext(dataRecord.message.trim(), dataRecord, name)
    }
    if (typeof errorRecord?.message === 'string' && errorRecord.message.trim()) {
        return appendErrorContext(errorRecord.message.trim(), dataRecord || errorRecord, name)
    }
    try {
        return `OpenCode session failed: ${JSON.stringify(error)}`
    } catch {
        return 'OpenCode session failed.'
    }
}

function appendErrorContext(message: string, record: Record<string, unknown> | null, name: string) {
    const parts = [message]
    const statusCode = typeof record?.statusCode === 'number' ? record.statusCode : null
    const retryable = typeof record?.isRetryable === 'boolean' ? record.isRetryable : null
    const label = [
        name && name !== 'unknown' ? name : null,
        statusCode ? `HTTP ${statusCode}` : null,
        retryable === true ? 'retryable' : retryable === false ? 'not retryable' : null,
    ].filter(Boolean).join(', ')
    if (label) {
        parts.push(`(${label})`)
    }
    return parts.join(' ')
}

export function extractToolEventOutput(props: Record<string, unknown>): string | undefined {
    const content = props.content
    if (Array.isArray(content)) {
        const text = content
            .map((entry) => {
                const record = readRecord(entry)
                if (!record) return ''
                if (typeof record.text === 'string') return record.text
                if (typeof record.uri === 'string') return record.uri
                return ''
            })
            .filter(Boolean)
            .join('\n')
        if (text) return text
    }

    const structured = readRecord(props.structured)
    if (structured && Object.keys(structured).length > 0) {
        try {
            return JSON.stringify(structured, null, 2)
        } catch {
            return String(structured)
        }
    }

    return undefined
}
