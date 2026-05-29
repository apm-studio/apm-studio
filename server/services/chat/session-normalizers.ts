import type {
    ChatSessionRevertState,
    ChatSessionSummary,
} from '../../../shared/chat-contracts.js'

export type OpenCodeRawSessionSummary = {
    id: string
    title?: string
    createdAt?: number
    updatedAt?: number
    parentID?: string | null
    time?: {
        created?: number
        updated?: number
    }
}

export function readResponseHeader(result: unknown, name: string): string | null {
    if (!result || typeof result !== 'object') {
        return null
    }

    const response = (result as { response?: { headers?: { get?: (name: string) => string | null } } }).response
    if (!response?.headers || typeof response.headers.get !== 'function') {
        return null
    }

    const value = response.headers.get(name)
    if (!value) {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function normalizeRevertState(value: unknown): ChatSessionRevertState | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const revert = (value as { revert?: { messageID?: unknown; partID?: unknown } | null }).revert
    if (!revert || typeof revert.messageID !== 'string' || !revert.messageID.trim()) {
        return null
    }
    return {
        messageId: revert.messageID,
        ...(typeof revert.partID === 'string' && revert.partID.trim() ? { partId: revert.partID } : {}),
    }
}

export function normalizeOpenCodeSessionSummary(
    session: OpenCodeRawSessionSummary | null | undefined,
    status: ChatSessionSummary['status'] | undefined,
    sidebarTitle: string | null | undefined,
): ChatSessionSummary | null {
    if (!session?.id) {
        return null
    }
    return {
        id: session.id,
        ...(typeof session.title === 'string' ? { title: session.title } : {}),
        createdAt: typeof session.createdAt === 'number' ? session.createdAt : session.time?.created,
        updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : session.time?.updated,
        parentId: typeof session.parentID === 'string' ? session.parentID : null,
        ...(status ? { status } : {}),
        ...(sidebarTitle ? { sidebarTitle } : {}),
    }
}
