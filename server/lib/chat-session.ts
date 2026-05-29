import { unwrapOpencodeResult } from './opencode-errors.js'
import { getOpencode } from './opencode.js'
import { requestDirectoryQuery } from './request-context.js'
import { normalizeChatSessionMessages } from '../../shared/chat-session-message.js'
import { normalizeChatSessionStatusMap } from '../../shared/chat-session-status.js'
import type { ChatSessionMessage, ChatSessionMessagePart, ChatSessionStatus } from '../../shared/chat-contracts.js'

type ToolPartLike = ChatSessionMessagePart & { type: 'tool' }
type MessageWithParts = ChatSessionMessage

export type SessionStatusLike = Partial<Pick<ChatSessionStatus, 'type'>>

function isToolPartLike(value: ChatSessionMessagePart): value is ToolPartLike {
    return value.type === 'tool'
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function readMessageRole(message: MessageWithParts) {
    return message.role || null
}

function getLastNonSystemMessage(messages: MessageWithParts[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (readMessageRole(message) !== 'system') {
            return message
        }
    }

    return null
}

function readToolName(part: ToolPartLike) {
    if (typeof part.tool === 'string' && part.tool.trim().length > 0) {
        return part.tool
    }
    return null
}

export function hasSettledLatestAssistantTurn(messages: MessageWithParts[]) {
    const lastMessage = getLastNonSystemMessage(messages)
    if (!lastMessage || readMessageRole(lastMessage) !== 'assistant') {
        return false
    }

    if (typeof lastMessage.completedAt === 'number' || !!lastMessage.error) {
        return true
    }

    const parts = Array.isArray(lastMessage.parts) ? lastMessage.parts : []
    const toolParts = parts
        .filter(isToolPartLike)

    if (toolParts.some((part) => part.state?.status === 'pending' || part.state?.status === 'running')) {
        return false
    }

    if (parts.some((part) => part.type === 'step-finish')) {
        return true
    }

    return toolParts.some((part) => part.state?.status === 'completed' || part.state?.status === 'error')
}

export function isSessionParkedByWaitUntil(messages: MessageWithParts[]) {
    const lastMessage = getLastNonSystemMessage(messages)
    if (!lastMessage || readMessageRole(lastMessage) !== 'assistant') {
        return false
    }

    const toolParts = (Array.isArray(lastMessage.parts) ? lastMessage.parts : [])
        .filter(isToolPartLike)

    if (toolParts.length === 0) {
        return false
    }

    if (toolParts.some((part) => part.state?.status === 'pending' || part.state?.status === 'running')) {
        return false
    }

    return toolParts.some((part) => readToolName(part) === 'wait_until' && part.state?.status === 'completed')
}

export function isSessionStatusActive(status: SessionStatusLike | null | undefined) {
    return status?.type === 'busy' || status?.type === 'retry'
}

export function isSessionEffectivelySettled(messages: MessageWithParts[]) {
    return isSessionParkedByWaitUntil(messages) || hasSettledLatestAssistantTurn(messages)
}

export function resolveEffectiveSessionStatus<T extends SessionStatusLike>(params: {
    directStatus?: T | null
    messages: MessageWithParts[]
}) {
    const { directStatus, messages } = params

    if (directStatus?.type === 'idle' || directStatus?.type === 'error') {
        return directStatus
    }

    if (isSessionStatusActive(directStatus) && isSessionParkedByWaitUntil(messages)) {
        return { type: 'idle' } as const
    }

    if (directStatus?.type) {
        return directStatus
    }

    return deriveImplicitIdleSessionState(messages).status
}

export function isSessionEffectivelyRunning(params: {
    directStatus?: SessionStatusLike | null
    messages: MessageWithParts[]
}) {
    return isSessionStatusActive(params.directStatus) && !isSessionParkedByWaitUntil(params.messages)
}

function hasCompletedAssistantTurn(messages: MessageWithParts[]) {
    return messages.some((message) => {
        if (readMessageRole(message) !== 'assistant') {
            return false
        }

        if (typeof message.completedAt === 'number') {
            return true
        }

        return Array.isArray(message.parts) && message.parts.some((part) => {
            if (part.type === 'step-finish') {
                return true
            }
            if (part.type === 'tool') {
                const status = part.state?.status
                return status === 'completed' || status === 'error'
            }
            return part.type === 'text' || part.type === 'reasoning'
        })
    })
}

export function normalizeIncompleteToolParts<T extends MessageWithParts>(messages: T[], settledAt: number): T[] {
    return messages.map((message) => {
        if (!Array.isArray(message?.parts) || message.parts.length === 0) {
            return message
        }

        const nextParts = message.parts.map((part) => {
            if (!isToolPartLike(part) || !part.state) {
                return part
            }
            const status = part.state.status
            if (status !== 'pending' && status !== 'running') {
                return part
            }
            return {
                ...part,
                state: {
                    ...part.state,
                    status: 'error',
                    error: part.state.error || 'Stopped before the tool finished.',
                    time: {
                        ...(part.state.time || {}),
                        ...(typeof part.state.time?.start === 'number' ? {} : { start: settledAt }),
                        end: settledAt,
                    },
                },
            }
        })

        return {
            ...message,
            parts: nextParts,
        } as T
    })
}

export function deriveImplicitIdleSessionState<T extends MessageWithParts>(messages: T[], settledAt = Date.now()) {
    const normalizedMessages = normalizeIncompleteToolParts(messages, settledAt)
    return {
        messages: normalizedMessages,
        status: hasCompletedAssistantTurn(normalizedMessages)
            ? ({ type: 'idle' } as const)
            : null,
    }
}

export async function waitForSessionToSettle(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    sessionId: string,
    directoryQuery: ReturnType<typeof requestDirectoryQuery>,
    options?: {
        timeoutMs?: number
        pollMs?: number
        requireObservedBusy?: boolean
    },
) {
    const deadline = Date.now() + (options?.timeoutMs ?? 3_000)
    let observedBusy = false
    while (Date.now() < deadline) {
        const statuses = normalizeChatSessionStatusMap(unwrapOpencodeResult<unknown>(await oc.session.status({
            ...directoryQuery,
        })))
        const status = statuses?.[sessionId]
        if (isSessionStatusActive(status)) {
            observedBusy = true
        }
        if (status?.type === 'idle') {
            return true
        }
        if (!status && (!options?.requireObservedBusy || observedBusy)) {
            return true
        }
        if (!status && options?.requireObservedBusy && !observedBusy) {
            const rawMessages = normalizeChatSessionMessages(unwrapOpencodeResult<unknown>(await oc.session.messages({
                sessionID: sessionId,
                ...directoryQuery,
            })))
            if (deriveImplicitIdleSessionState(rawMessages).status?.type === 'idle') {
                return true
            }
        }
        await sleep(options?.pollMs ?? 150)
    }
    return false
}

export function extractNonRetryableSessionError(messages: MessageWithParts[]): string | null {
    const lastAssistant = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant')

    const error = lastAssistant?.error
    if (!error || typeof error !== 'object') {
        return null
    }

    const retryable = (
        'data' in error
        && error.data
        && typeof error.data === 'object'
        && 'isRetryable' in error.data
        && typeof error.data.isRetryable === 'boolean'
    )
        ? error.data.isRetryable
        : undefined

    const message = (
        'data' in error
        && error.data
        && typeof error.data === 'object'
        && 'message' in error.data
        && typeof error.data.message === 'string'
    )
        ? error.data.message
        : ('message' in error && typeof error.message === 'string' ? error.message : null)

    if (retryable === false) {
        return message || 'Non-retryable session error.'
    }

    return null
}

export function uniquePrimitiveRefs(
    refs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>,
) {
    const seen = new Set<string>()
    return refs.filter((ref) => {
        const key = ref.kind === 'registry' ? `registry:${ref.urn}` : `draft:${ref.draftId}`
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}
