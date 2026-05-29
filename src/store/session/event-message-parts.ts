import type { ChatMessagePart } from './chat-message-types'
export type SessionEventMessagePart = {
    id: string
    type?: string
    text?: string
    tool?: string
    callID?: string
    state?: {
        status?: 'pending' | 'running' | 'completed' | 'error' | 'failed'
        title?: string
        input?: unknown
        metadata?: unknown
        output?: unknown
        error?: unknown
        time?: { start?: unknown; end?: unknown }
    }
    reason?: string
    cost?: unknown
    tokens?: unknown
    auto?: boolean
    overflow?: unknown
}

type ToolStatus = NonNullable<ChatMessagePart['tool']>['status']

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function recordField(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeToolStatus(value: unknown): ToolStatus {
    if (value === 'failed') return 'error'
    return value === 'pending' || value === 'running' || value === 'completed' || value === 'error'
        ? value
        : 'pending'
}

function normalizeToolTime(value: unknown): NonNullable<ChatMessagePart['tool']>['time'] | undefined {
    const record = recordField(value)
    if (!record) return undefined
    const start = numberField(record, 'start')
    if (start === undefined) return undefined
    const end = numberField(record, 'end')
    return { start, ...(end !== undefined ? { end } : {}) }
}

function normalizeStepTokens(value: unknown): NonNullable<ChatMessagePart['step']>['tokens'] | undefined {
    const record = recordField(value)
    if (!record) return undefined
    const input = numberField(record, 'input')
    const output = numberField(record, 'output')
    const reasoning = numberField(record, 'reasoning')
    return input !== undefined && output !== undefined && reasoning !== undefined
        ? { input, output, reasoning }
        : undefined
}

export function formatToolError(error: unknown): string | undefined {
    if (error === undefined || error === null) {
        return undefined
    }
    if (typeof error === 'string') {
        return error
    }
    if (typeof error === 'object') {
        const record = recordField(error)
        const data = recordField(record?.data)
        const message = typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : typeof record?.message === 'string' && record.message.trim()
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

export function mapSessionEventMessagePart(part: SessionEventMessagePart): ChatMessagePart | null {
    if (part.type === 'text') {
        return {
            id: part.id,
            type: 'text',
            content: typeof part.text === 'string' ? part.text : '',
        }
    }

    if (part.type === 'reasoning') {
        return {
            id: part.id,
            type: 'reasoning',
            content: typeof part.text === 'string' ? part.text : '',
        }
    }

    if (part.type === 'tool') {
        if (!part.callID) {
            return null
        }
        const state = part.state || {}
        return {
            id: part.id,
            type: 'tool',
            tool: {
                name: part.tool || 'unknown',
                callId: part.callID,
                status: normalizeToolStatus(state.status),
                title: state.title,
                input: recordField(state.input),
                metadata: recordField(state.metadata),
                output: typeof state.output === 'string' ? state.output : undefined,
                error: formatToolError(state.error),
                time: normalizeToolTime(state.time),
            },
        }
    }

    if (part.type === 'step-start' || part.type === 'step-finish') {
        return {
            id: part.id,
            type: part.type,
            step: part.type === 'step-finish'
                ? {
                    reason: part.reason,
                    cost: typeof part.cost === 'number' ? part.cost : undefined,
                    tokens: normalizeStepTokens(part.tokens),
                }
                : undefined,
        }
    }

    if (part.type === 'compaction') {
        return {
            id: part.id,
            type: 'compaction',
            compaction: {
                auto: !!part.auto,
                overflow: typeof part.overflow === 'boolean' ? part.overflow : undefined,
                summary: typeof part.text === 'string' ? part.text : undefined,
            },
        }
    }

    return null
}
