import type { ChatSessionStatus } from './chat-contracts.js'

const SESSION_STATUS_TYPES = new Set<ChatSessionStatus['type']>([
    'idle',
    'busy',
    'retry',
    'error',
])

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeChatSessionStatus(value: unknown): ChatSessionStatus | null {
    if (!isRecord(value) || typeof value.type !== 'string') {
        return null
    }
    if (!SESSION_STATUS_TYPES.has(value.type as ChatSessionStatus['type'])) {
        return null
    }
    return {
        type: value.type as ChatSessionStatus['type'],
        ...(typeof value.message === 'string' ? { message: value.message } : {}),
    }
}

export function normalizeChatSessionStatusMap(value: unknown): Record<string, ChatSessionStatus> {
    if (!isRecord(value)) {
        return {}
    }
    return Object.fromEntries(
        Object.entries(value)
            .map(([sessionId, status]) => [sessionId, normalizeChatSessionStatus(status)] as const)
            .filter((entry): entry is readonly [string, ChatSessionStatus] => !!entry[1]),
    )
}
