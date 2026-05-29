import type {
    ChatSessionDiffEntry,
    ChatSessionMessage,
    ChatSessionMessagesRequest,
    ChatSessionMessagesResponse,
    ChatSessionSummary,
} from '../../../shared/chat-contracts.js'
import { normalizeChatSessionDiffEntries } from '../../../shared/chat-session-diff.js'
import { normalizeChatSessionMessages } from '../../../shared/chat-session-message.js'
import { normalizeChatSessionStatusMap } from '../../../shared/chat-session-status.js'
import {
    isSessionStatusActive,
    normalizeIncompleteToolParts,
    resolveEffectiveSessionStatus,
} from '../../lib/chat-session.js'
import { getOpencode } from '../../lib/opencode.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { directoryQueryForSession } from './session-directory.js'
import {
    normalizeOpenCodeSessionSummary,
    type OpenCodeRawSessionSummary,
    readResponseHeader,
} from './session-normalizers.js'
import { listSessionOwnershipsForWorkingDir } from './session-ownership-service.js'

export async function getStudioChatSessionStatus(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const statuses = normalizeChatSessionStatusMap(unwrapOpencodeResult<unknown>(await oc.session.status({
        ...directoryQuery,
    })))
    const directStatus = statuses[sessionId] || null
    if (directStatus && !isSessionStatusActive(directStatus)) {
        return {
            status: directStatus,
        }
    }

    let rawMessages: ChatSessionMessage[] = []
    try {
        rawMessages = normalizeChatSessionMessages(unwrapOpencodeResult<unknown>(await oc.session.messages({
            sessionID: sessionId,
            ...directoryQuery,
        })))
    } catch (error) {
        if (directStatus) {
            return {
                status: directStatus,
            }
        }
        throw error
    }

    return {
        status: resolveEffectiveSessionStatus({
            directStatus,
            messages: rawMessages,
        }),
    }
}

export async function listStudioSessionMessages(
    workingDir: string,
    sessionId: string,
    options: ChatSessionMessagesRequest = {},
): Promise<ChatSessionMessagesResponse> {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const params: Record<string, unknown> = {
        sessionID: sessionId,
        ...directoryQuery,
    }
    if (typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
        params.limit = options.limit
    }
    if (typeof options.before === 'string' && options.before.trim()) {
        params.before = options.before.trim()
    }

    const messageResult = await oc.session.messages(params as {
        sessionID: string
        directory?: string
        limit?: number
        before?: string
    })
    const data = normalizeChatSessionMessages(unwrapOpencodeResult<unknown>(messageResult))
    const statuses = normalizeChatSessionStatusMap(unwrapOpencodeResult<unknown>(await oc.session.status({
        ...directoryQuery,
    })))
    const status = statuses?.[sessionId]
    const messages = !status || status.type === 'idle'
        ? normalizeIncompleteToolParts(data || [], Date.now())
        : (data || [])
    return {
        messages,
        nextCursor: readResponseHeader(messageResult, 'x-next-cursor'),
    }
}

export async function listStudioSessionDiff(workingDir: string, sessionId: string): Promise<ChatSessionDiffEntry[]> {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const rawDiff = unwrapOpencodeResult<unknown>(await oc.session.diff({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    return normalizeChatSessionDiffEntries(rawDiff)
}

export async function listStudioChatSessions(workingDir: string): Promise<ChatSessionSummary[]> {
    const oc = await getOpencode()
    const ownerships = await listSessionOwnershipsForWorkingDir(workingDir)
    const sidebarTitleBySessionId = new Map(
        ownerships.map((ownership) => [ownership.sessionId, ownership.sidebarTitle || null]),
    )
    const directories = [workingDir]
    const directoryData = await Promise.all(
        directories.map(async (directory) => {
            const [sessions, statuses] = await Promise.all([
                unwrapOpencodeResult<unknown[]>(await oc.session.list({ directory })),
                normalizeChatSessionStatusMap(unwrapOpencodeResult<unknown>(await oc.session.status({ directory }))),
            ])
            return {
                sessions: sessions || [],
                statuses: statuses || {},
            }
        }),
    )
    const sessions = new Map<string, ChatSessionSummary>()
    for (const entry of directoryData) {
        for (const session of entry.sessions) {
            const normalized = normalizeOpenCodeSessionSummary(
                session as OpenCodeRawSessionSummary,
                typeof session === 'object' && session && 'id' in session && typeof session.id === 'string'
                    ? entry.statuses[session.id]?.type
                    : undefined,
                typeof session === 'object' && session && 'id' in session && typeof session.id === 'string'
                    ? sidebarTitleBySessionId.get(session.id)
                    : null,
            )
            if (!normalized) continue
            const existing = sessions.get(normalized.id)
            const existingUpdatedAt = existing?.updatedAt || 0
            const nextUpdatedAt = normalized.updatedAt || 0
            if (!existing || nextUpdatedAt >= existingUpdatedAt) {
                sessions.set(normalized.id, normalized)
            }
        }
    }
    return Array.from(sessions.values())
}
