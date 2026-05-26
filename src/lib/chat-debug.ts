import type { ChatMessage } from '../types'

const CHAT_DEBUG_STORAGE_KEYS = ['agent-roster-chat-debug', 'roster-chat-debug']

function readStorageFlag(storage: Storage | undefined) {
    if (!storage) return false
    try {
        return CHAT_DEBUG_STORAGE_KEYS.some((key) => {
            const value = storage.getItem(key)
            return value === '1' || value === 'true' || value === 'on'
        })
    } catch {
        return false
    }
}

export function isChatDebugEnabled() {
    if (typeof window === 'undefined') {
        return false
    }

    const flags = window as Window & {
        __AGENT_ROSTER_CHAT_DEBUG__?: unknown
        __DOT_CHAT_DEBUG__?: unknown
    }
    const fromWindow = flags.__AGENT_ROSTER_CHAT_DEBUG__ ?? flags.__DOT_CHAT_DEBUG__
    if (fromWindow === true) {
        return true
    }

    return readStorageFlag(window.localStorage) || readStorageFlag(window.sessionStorage)
}

export function logChatDebug(scope: string, message: string, details?: Record<string, unknown>) {
    if (!isChatDebugEnabled()) {
        return
    }

    if (details) {
        console.debug(`[chat-debug:${scope}] ${message}`, details)
        return
    }

    console.debug(`[chat-debug:${scope}] ${message}`)
}

export function summarizeMessagesForChatDebug(messages: ChatMessage[]) {
    const tail = messages.slice(-5).map((message) => ({
        id: message.id,
        role: message.role,
        contentLength: message.content.length,
        timestamp: message.timestamp,
    }))

    return {
        count: messages.length,
        tail,
    }
}
