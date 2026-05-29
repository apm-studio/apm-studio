import type { ChatMessage } from '../store/session/chat-message-types'

export function upsertAssistantStreamingMessage(
    messages: ChatMessage[],
    messageId: string,
    content: string,
    timestamp = Date.now(),
): ChatMessage[] {
    const next = [...messages]
    const index = next.findIndex((message) => message.id === messageId)
    if (index === -1) {
        next.push({
            id: messageId,
            role: 'assistant',
            content,
            timestamp,
        })
        return next
    }

    next[index] = {
        ...next[index],
        role: 'assistant',
        content,
    }
    return next
}
