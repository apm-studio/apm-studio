import type { ChatSessionMessage } from '../../../shared/chat-contracts.js'

export type DiscordBackfillMessage = {
    id: string
    content: string
}

export function messageRole(message: ChatSessionMessage) {
    const role = message.role
    return typeof role === 'string' ? role : ''
}

export function messageId(message: ChatSessionMessage, fallback: string) {
    if (typeof message.id === 'string' && message.id.trim()) {
        return message.id.trim()
    }
    return fallback
}

export function visibleTextFromMessage(message: ChatSessionMessage) {
    const text = (message.parts || [])
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim()
    if (text) {
        return text
    }
    if (typeof message.text === 'string' && message.text.trim()) {
        return message.text.trim()
    }
    const content = message.content
    if (typeof content === 'string' && content.trim()) {
        return content.trim()
    }
    return ''
}

export function latestAssistantMessage(messages: ChatSessionMessage[], afterMessageId?: string | null) {
    for (const message of [...messages].reverse()) {
        const id = messageId(message, '')
        if (afterMessageId && id === afterMessageId) {
            return null
        }

        if (message.role !== 'assistant') {
            continue
        }

        const text = visibleTextFromMessage(message)
        if (text) {
            return { id, text }
        }
    }
    return null
}

export function formatDiscordBackfillMessages(params: {
    sessionId: string
    assistantLabel: string
    messages: ChatSessionMessage[]
    knownMessageIds?: string[]
    limit?: number
    includeUserMessages?: boolean
}) {
    const known = new Set(params.knownMessageIds || [])
    const includeUserMessages = params.includeUserMessages !== false
    const visible = params.messages
        .map((message, index): DiscordBackfillMessage | null => {
            const role = messageRole(message)
            if (role !== 'assistant' && (!includeUserMessages || role !== 'user')) {
                return null
            }
            const text = visibleTextFromMessage(message)
            if (!text) {
                return null
            }
            const id = `${params.sessionId}:${messageId(message, String(index))}`
            if (known.has(id)) {
                return null
            }
            const label = role === 'assistant' ? params.assistantLabel : 'APM User'
            return {
                id,
                content: `**[${label}]**\n${text}`,
            }
        })
        .filter((message): message is DiscordBackfillMessage => !!message)
    return visible.slice(-(params.limit || 20))
}
