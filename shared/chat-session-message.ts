import type {
    ChatSessionMessage,
    ChatSessionMessagePart,
    ChatSessionMessagePartType,
    ChatSessionRole,
    ChatSessionToolError,
} from './chat-contracts.js'

const MESSAGE_ROLES = new Set<ChatSessionRole>(['user', 'assistant', 'system'])
const PART_TYPES = new Set<ChatSessionMessagePartType>([
    'text',
    'reasoning',
    'tool',
    'step-start',
    'step-finish',
    'compaction',
    'file',
])

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key]
    return typeof value === 'string' ? value : undefined
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
    const value = record[key]
    return typeof value === 'boolean' ? value : undefined
}

function toolNameField(record: Record<string, unknown>): string | undefined {
    const value = record.tool
    if (typeof value === 'string' && value.trim()) {
        return value
    }
    if (isRecord(value)) {
        return stringField(value, 'name')
    }
    return undefined
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const value = record[key]
    return isRecord(value) ? value : undefined
}

function normalizeRole(value: unknown): ChatSessionRole | undefined {
    return typeof value === 'string' && MESSAGE_ROLES.has(value as ChatSessionRole)
        ? value as ChatSessionRole
        : undefined
}

function normalizePartType(value: unknown): ChatSessionMessagePartType | undefined {
    return typeof value === 'string' && PART_TYPES.has(value as ChatSessionMessagePartType)
        ? value as ChatSessionMessagePartType
        : undefined
}

function normalizeTokens(value: unknown): ChatSessionMessagePart['tokens'] | undefined {
    if (!isRecord(value)) return undefined
    const input = numberField(value, 'input')
    const output = numberField(value, 'output')
    const reasoning = numberField(value, 'reasoning')
    if (input === undefined || output === undefined || reasoning === undefined) {
        return undefined
    }
    const cache = recordField(value, 'cache')
    const cacheRead = cache ? numberField(cache, 'read') : undefined
    const cacheWrite = cache ? numberField(cache, 'write') : undefined
    return {
        input,
        output,
        reasoning,
        ...(cacheRead !== undefined && cacheWrite !== undefined
            ? { cache: { read: cacheRead, write: cacheWrite } }
            : {}),
    }
}

function normalizeToolState(value: unknown): ChatSessionMessagePart['state'] | undefined {
    if (!isRecord(value)) return undefined
    const time = recordField(value, 'time')
    const start = time ? numberField(time, 'start') : undefined
    const end = time ? numberField(time, 'end') : undefined
    return {
        ...(stringField(value, 'status') ? { status: stringField(value, 'status') } : {}),
        ...(stringField(value, 'title') ? { title: stringField(value, 'title') } : {}),
        ...(recordField(value, 'input') ? { input: recordField(value, 'input') } : {}),
        ...(recordField(value, 'metadata') ? { metadata: recordField(value, 'metadata') } : {}),
        ...(stringField(value, 'output') ? { output: stringField(value, 'output') } : {}),
        ...(value.error !== undefined ? { error: value.error as ChatSessionToolError } : {}),
        ...(start !== undefined ? { time: { start, ...(end !== undefined ? { end } : {}) } } : {}),
    }
}

export function normalizeChatSessionMessagePart(value: unknown): ChatSessionMessagePart | null {
    if (!isRecord(value)) return null
    const type = normalizePartType(value.type)
    if (!type) return null
    const state = normalizeToolState(value.state)
    const toolName = toolNameField(value)
    const callId = stringField(value, 'callID')
    if (type === 'tool' && !callId) {
        return null
    }
    return {
        ...(stringField(value, 'id') ? { id: stringField(value, 'id') } : {}),
        type,
        ...(stringField(value, 'text') ? { text: stringField(value, 'text') } : {}),
        ...(stringField(value, 'filename') ? { filename: stringField(value, 'filename') } : {}),
        ...(stringField(value, 'mime') ? { mime: stringField(value, 'mime') } : {}),
        ...(stringField(value, 'url') ? { url: stringField(value, 'url') } : {}),
        ...(toolName ? { tool: toolName } : {}),
        ...(callId ? { callId } : {}),
        ...(state ? { state } : {}),
        ...(stringField(value, 'reason') ? { reason: stringField(value, 'reason') } : {}),
        ...(numberField(value, 'cost') !== undefined ? { cost: numberField(value, 'cost') } : {}),
        ...(normalizeTokens(value.tokens) ? { tokens: normalizeTokens(value.tokens) } : {}),
        ...(booleanField(value, 'auto') !== undefined ? { auto: booleanField(value, 'auto') } : {}),
        ...(booleanField(value, 'overflow') !== undefined ? { overflow: booleanField(value, 'overflow') } : {}),
    }
}

function normalizeModel(value: unknown, rawInfo?: Record<string, unknown>): ChatSessionMessage['model'] | undefined {
    if (!isRecord(value)) return undefined
    const providerId = stringField(value, 'providerID')
    const modelId = stringField(value, 'modelID')
    const variant = stringField(value, 'variant') || (rawInfo ? stringField(rawInfo, 'variant') : undefined)
    return {
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(variant ? { variant } : {}),
    }
}

function normalizeMessageError(value: unknown): ChatSessionMessage['error'] | undefined {
    if (!isRecord(value)) return undefined
    const data = recordField(value, 'data')
    return {
        ...(data
            ? {
                data: {
                    ...(stringField(data, 'message') ? { message: stringField(data, 'message') } : {}),
                    ...(booleanField(data, 'isRetryable') !== undefined ? { isRetryable: booleanField(data, 'isRetryable') } : {}),
                },
            }
            : {}),
        ...(stringField(value, 'message') ? { message: stringField(value, 'message') } : {}),
    }
}

export function normalizeChatSessionMessage(value: unknown): ChatSessionMessage | null {
    if (!isRecord(value)) return null
    const rawInfo = isRecord(value.info) ? value.info : undefined
    const rawTime = rawInfo ? recordField(rawInfo, 'time') : undefined
    const model = normalizeModel(value.model, rawInfo)
    const agent = stringField(value, 'agent') || (rawInfo ? stringField(rawInfo, 'agent') : undefined)
    const id = stringField(value, 'id') || (rawInfo ? stringField(rawInfo, 'id') : undefined)
    const role = normalizeRole(value.role) || (rawInfo ? normalizeRole(rawInfo.role) : undefined)
    const createdAt = numberField(value, 'createdAt')
        ?? (rawTime ? numberField(rawTime, 'created') : undefined)
    const completedAt = rawTime ? numberField(rawTime, 'completed') : undefined
    const error = rawInfo ? normalizeMessageError(rawInfo.error) : undefined
    const parts = Array.isArray(value.parts)
        ? value.parts
            .map(normalizeChatSessionMessagePart)
            .filter((part): part is ChatSessionMessagePart => !!part)
        : undefined
    return {
        ...(id ? { id } : {}),
        ...(role ? { role } : {}),
        ...(agent ? { agent } : {}),
        ...(stringField(value, 'content') ? { content: stringField(value, 'content') } : {}),
        ...(model && Object.keys(model).length > 0 ? { model } : {}),
        ...(error && Object.keys(error).length > 0 ? { error } : {}),
        ...(parts && parts.length > 0 ? { parts } : {}),
        ...(stringField(value, 'text') ? { text: stringField(value, 'text') } : {}),
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
    }
}

export function normalizeChatSessionMessages(value: unknown): ChatSessionMessage[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value
        .map(normalizeChatSessionMessage)
        .filter((message): message is ChatSessionMessage => !!message)
}
