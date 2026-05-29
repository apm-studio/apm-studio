import type { ChatMessage, ChatMessagePart } from '../store/session/chat-message-types'
import type {
    ChatSessionMessage,
    ChatSessionMessagePart,
    ChatSessionToolError,
} from '../../shared/chat-contracts'

export type SessionMessageLike = ChatSessionMessage

function readSessionString(value: unknown, ...keys: string[]): string | null {
    let current: unknown = value
    for (const key of keys) {
        if (!current || typeof current !== 'object' || !(key in current)) {
            return null
        }
        current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'string' && current.trim() ? current : null
}

function readSessionBoolean(value: unknown, ...keys: string[]): boolean | null {
    let current: unknown = value
    for (const key of keys) {
        if (!current || typeof current !== 'object' || !(key in current)) {
            return null
        }
        current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'boolean' ? current : null
}

function extractAssistantErrorMessage(message: SessionMessageLike): string | null {
    const error = message.error
    if (!error) {
        return null
    }

    if (typeof error.data?.message === 'string' && error.data.message.trim()) {
        return error.data.message.trim()
    }

    if (typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim()
    }

    return 'OpenCode session failed.'
}

function buildMessageMetadata(
    message: SessionMessageLike,
): ChatMessage['metadata'] | undefined {
    const agentName = readSessionString(message, 'agent')
    const provider = readSessionString(message, 'model', 'providerId')
    const modelId = readSessionString(message, 'model', 'modelId')
    const variant = readSessionString(message, 'model', 'variant')

    if (!agentName && !provider && !modelId && !variant) {
        return undefined
    }

    return {
        ...(agentName ? { agentName } : {}),
        ...(provider ? { provider } : {}),
        ...(modelId ? { modelId } : {}),
        ...(variant ? { variant } : {}),
    }
}

function formatToolError(error: ChatSessionToolError | undefined): string | undefined {
    if (error === undefined || error === null) {
        return undefined
    }
    if (typeof error === 'string') {
        return error
    }
    if (typeof error === 'object') {
        const record = error as Record<string, unknown>
        const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : null
        const message = typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : typeof record.message === 'string' && record.message.trim()
                ? record.message.trim()
                : null
        if (message) {
            return message
        }
        try {
            return JSON.stringify(error)
        } catch {
            return 'Tool call failed.'
        }
    }
    return String(error)
}

function mapPartToChatMessagePart(part: ChatSessionMessagePart): ChatMessagePart | null {
    if (!part.id || !part.type) return null

    if (part.type === 'text') {
        return {
            id: part.id,
            type: 'text',
            content: part.text || '',
        }
    }

    if (part.type === 'reasoning') {
        return {
            id: part.id,
            type: 'reasoning',
            content: part.text || '',
        }
    }

    if (part.type === 'tool') {
        if (!part.callId) {
            return null
        }
        const s = part.state || {}
        const rawStatus = s.status === 'failed' ? 'error' : s.status
        const status = rawStatus === 'pending' || rawStatus === 'running' || rawStatus === 'completed' || rawStatus === 'error'
            ? rawStatus
            : 'pending'
        return {
            id: part.id,
            type: 'tool',
            tool: {
                name: part.tool || 'unknown',
                callId: part.callId,
                status,
                title: s.title,
                input: s.input,
                metadata: s.metadata,
                output: s.output,
                error: formatToolError(s.error),
                time: s.time,
            },
        }
    }

    if (part.type === 'step-start' || part.type === 'step-finish') {
        return {
            id: part.id,
            type: part.type as 'step-start' | 'step-finish',
            step: part.type === 'step-finish' ? {
                reason: part.reason,
                cost: part.cost,
                tokens: part.tokens ? {
                    input: part.tokens.input,
                    output: part.tokens.output,
                    reasoning: part.tokens.reasoning,
                } : undefined,
            } : undefined,
        }
    }

    if (part.type === 'compaction') {
        return {
            id: part.id,
            type: 'compaction',
            compaction: {
                auto: !!part.auto,
                overflow: part.overflow,
                summary: part.text,
            },
        }
    }

    return null
}

// Context sections are joined by this separator in message-service.ts:
// const promptSections = [assistantContextPrefix, request.message].filter(Boolean)
// They are joined as: promptSections.join('\n\n---\n\n')
// When syncing from server, user messages may contain the full composed prompt.
// Strip the injected context sections to show only the user's original input.
const PROMPT_SECTION_SEPARATOR = '\n\n---\n\n'

function stripInjectedContextFromUserMessage(text: string): string {
    const lastSeparatorIndex = text.lastIndexOf(PROMPT_SECTION_SEPARATOR)
    if (lastSeparatorIndex === -1) return text
    return text.slice(lastSeparatorIndex + PROMPT_SECTION_SEPARATOR.length)
}

export function mapSessionMessageToChatMessage(message: SessionMessageLike): ChatMessage {
    const rawRole = message.role || 'assistant'
    const rawTextContent = message.parts
        ?.filter((part) => part.type === 'text')
        .map((part) => part.text || '')
        .join('\n') || message.text || ''
    const strippedText = rawRole === 'user'
        ? stripInjectedContextFromUserMessage(rawTextContent)
        : rawTextContent
    const errorContent = extractAssistantErrorMessage(message)
    const textContent = strippedText || errorContent || ''
    const metadata = buildMessageMetadata(message)
    const role = (
        errorContent && rawRole === 'assistant'
            ? 'system'
            : rawRole
    ) as ChatMessage['role']

    const structuredParts: ChatMessagePart[] = []
    if (message.parts) {
        for (const part of message.parts) {
            const mapped = mapPartToChatMessagePart(part)
            if (mapped) {
                structuredParts.push(mapped)
            }
        }
    }

    const attachments = message.parts
        ?.filter((part) => part.type === 'file')
        .map((part) => ({
            type: 'file',
            filename: part.filename,
            mime: part.mime,
        }))
        .filter((attachment) => attachment.filename || attachment.mime)

    return {
        id: message.id || `msg-${Date.now()}`,
        role,
        content: textContent,
        timestamp: message.createdAt || Date.now(),
        ...(structuredParts.length > 0 ? { parts: structuredParts } : {}),
        ...(attachments?.length ? { attachments } : {}),
        ...(metadata ? { metadata } : {}),
    }
}

export function mapSessionMessagesToChatMessages(messages: SessionMessageLike[]): ChatMessage[] {
    return messages.map(mapSessionMessageToChatMessage)
}

export function extractLatestNonRetryableAssistantError(
    sessionMessages: SessionMessageLike[],
): { id: string; message: string } | null {
    for (let i = sessionMessages.length - 1; i >= 0; i--) {
        const message = sessionMessages[i]
        if (message.role !== 'assistant') {
            continue
        }

        const retryable = readSessionBoolean(message, 'error', 'data', 'isRetryable')
        const errorMessage = readSessionString(message, 'error', 'data', 'message')
            || readSessionString(message, 'error', 'message')
        const id = readSessionString(message, 'id')

        if (retryable === false && errorMessage && id) {
            return { id, message: errorMessage }
        }
    }

    return null
}
