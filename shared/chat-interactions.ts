import type {
    ChatPermissionRequest,
    ChatQuestionInfo,
    ChatQuestionOption,
    ChatQuestionRequest,
    ChatTodo,
} from './chat-contracts.js'

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key]
    return typeof value === 'string' && value.trim() ? value : undefined
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
    const value = record[key]
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : []
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const value = record[key]
    return isRecord(value) ? value : undefined
}

function normalizeToolRef(value: unknown): { messageId: string; callId: string } | undefined {
    if (!isRecord(value)) return undefined
    const messageId = stringField(value, 'messageID')
    const callId = stringField(value, 'callID')
    return messageId && callId ? { messageId, callId } : undefined
}

export function normalizeChatPermissionRequest(value: unknown): ChatPermissionRequest | null {
    if (!isRecord(value)) return null
    const id = stringField(value, 'id')
    const sessionId = stringField(value, 'sessionID')
    const permission = stringField(value, 'permission')
    if (!id || !sessionId || !permission) return null
    return {
        id,
        sessionId,
        permission,
        patterns: stringArrayField(value, 'patterns'),
        metadata: recordField(value, 'metadata') || {},
        always: stringArrayField(value, 'always'),
        ...(normalizeToolRef(value.tool) ? { tool: normalizeToolRef(value.tool) } : {}),
    }
}

export function normalizeChatPermissionRequests(value: unknown): ChatPermissionRequest[] {
    return Array.isArray(value)
        ? value
            .map(normalizeChatPermissionRequest)
            .filter((request): request is ChatPermissionRequest => !!request)
        : []
}

function normalizeQuestionOption(value: unknown): ChatQuestionOption | null {
    if (!isRecord(value)) return null
    const label = stringField(value, 'label')
    const description = stringField(value, 'description')
    return label && description ? { label, description } : null
}

function normalizeQuestionInfo(value: unknown): ChatQuestionInfo | null {
    if (!isRecord(value)) return null
    const question = stringField(value, 'question')
    const header = stringField(value, 'header')
    if (!question || !header) return null
    const options = Array.isArray(value.options)
        ? value.options
            .map(normalizeQuestionOption)
            .filter((option): option is ChatQuestionOption => !!option)
        : []
    return {
        question,
        header,
        options,
        ...(typeof value.multiple === 'boolean' ? { multiple: value.multiple } : {}),
        ...(typeof value.custom === 'boolean' ? { custom: value.custom } : {}),
    }
}

export function normalizeChatQuestionRequest(value: unknown): ChatQuestionRequest | null {
    if (!isRecord(value)) return null
    const id = stringField(value, 'id')
    const sessionId = stringField(value, 'sessionID')
    const questions = Array.isArray(value.questions)
        ? value.questions
            .map(normalizeQuestionInfo)
            .filter((question): question is ChatQuestionInfo => !!question)
        : []
    if (!id || !sessionId || questions.length === 0) return null
    return {
        id,
        sessionId,
        questions,
        ...(normalizeToolRef(value.tool) ? { tool: normalizeToolRef(value.tool) } : {}),
    }
}

export function normalizeChatQuestionRequests(value: unknown): ChatQuestionRequest[] {
    return Array.isArray(value)
        ? value
            .map(normalizeChatQuestionRequest)
            .filter((request): request is ChatQuestionRequest => !!request)
        : []
}

export function normalizeChatTodo(value: unknown): ChatTodo | null {
    if (!isRecord(value)) return null
    const content = stringField(value, 'content')
    const status = stringField(value, 'status')
    const priority = stringField(value, 'priority')
    return content && status && priority ? { content, status, priority } : null
}

export function normalizeChatTodos(value: unknown): ChatTodo[] {
    return Array.isArray(value)
        ? value
            .map(normalizeChatTodo)
            .filter((todo): todo is ChatTodo => !!todo)
        : []
}
