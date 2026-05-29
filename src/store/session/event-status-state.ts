import type { ChatMessage } from './chat-message-types'
import type { SessionStatus } from './types'

export function removeRetryMessage(messages: ChatMessage[], sessionId: string): ChatMessage[] {
    const retryMsgId = retryMessageId(sessionId)
    return messages.some((message) => message.id === retryMsgId)
        ? messages.filter((message) => message.id !== retryMsgId)
        : messages
}

export function upsertRetryMessage(
    messages: ChatMessage[],
    sessionId: string,
    status: SessionStatus,
): ChatMessage[] {
    const retryMsgId = retryMessageId(sessionId)
    const retryContent = `⏳ Retrying (Attempt ${status.attempt}): ${status.message || 'Operation failed, retrying...'}`
    const retryIndex = messages.findIndex((message) => message.id === retryMsgId)
    if (retryIndex >= 0) {
        const next = [...messages]
        next[retryIndex] = { ...next[retryIndex], content: retryContent }
        return next
    }

    return [...messages, {
        id: retryMsgId,
        role: 'system' as const,
        content: retryContent,
        timestamp: Date.now(),
    }]
}

export function buildSessionErrorMessage(errorMessage: string): ChatMessage {
    return {
        id: `system-${Date.now()}`,
        role: 'system' as const,
        content: `⚠️ ${errorMessage}`,
        timestamp: Date.now(),
    }
}

function retryMessageId(sessionId: string) {
    return `retry-${sessionId}`
}
