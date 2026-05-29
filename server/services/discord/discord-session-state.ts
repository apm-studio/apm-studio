import type {
    ChatPermissionRequest,
    ChatQuestionRequest,
} from '../../../shared/chat-contracts.js'
import {
    getStudioChatSessionStatus,
    listPendingPermissions,
    listPendingQuestions,
    listStudioSessionMessages,
} from '../chat/session-service.js'
import { latestAssistantMessage } from './discord-session-messages.js'

const SETTLE_TIMEOUT_MS = 10 * 60_000
const SETTLE_POLL_MS = 1_000
const SETTLE_IDLE_GRACE_MS = 4_000

export type DiscordAssistantReply =
    | { kind: 'message'; content: string }
    | { kind: 'permission'; request: ChatPermissionRequest }
    | { kind: 'question'; request: ChatQuestionRequest }

export type DiscordSessionBlock = {
    blocked: boolean
    reason?: 'running' | 'permission' | 'question'
    message?: string
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function findPendingStudioInteraction(workingDir: string, sessionId: string): Promise<DiscordAssistantReply | null> {
    const permissions = await listPendingPermissions(workingDir)
    const permission = permissions.find((request) => request.sessionId === sessionId)
    if (permission) {
        return { kind: 'permission', request: permission }
    }

    const questions = await listPendingQuestions(workingDir)
    const question = questions.find((request) => request.sessionId === sessionId)
    if (question) {
        return { kind: 'question', request: question }
    }

    return null
}

export async function describeDiscordSessionBlock(workingDir: string, sessionId: string): Promise<DiscordSessionBlock> {
    const pending = await findPendingStudioInteraction(workingDir, sessionId).catch(() => null)
    if (pending?.kind === 'permission') {
        return {
            blocked: true,
            reason: 'permission',
            message: 'This Studio thread is waiting for a permission response. Use the Discord permission buttons before sending another message.',
        }
    }
    if (pending?.kind === 'question') {
        return {
            blocked: true,
            reason: 'question',
            message: 'This Studio thread is waiting for a question response. Answer or cancel the Discord question prompt before sending another message.',
        }
    }

    const status = await getStudioChatSessionStatus(workingDir, sessionId).catch(() => ({ status: null }))
    if (status.status?.type === 'busy' || status.status?.type === 'retry') {
        return {
            blocked: true,
            reason: 'running',
            message: 'This Studio thread is still running. Wait for the current reply to finish before sending another message.',
        }
    }
    return { blocked: false }
}

export async function isDiscordSessionRunning(workingDir: string, sessionId: string) {
    const status = await getStudioChatSessionStatus(workingDir, sessionId).catch(() => ({ status: null }))
    return status.status?.type === 'busy' || status.status?.type === 'retry'
}

export async function waitForAssistantReply(
    workingDir: string,
    sessionId: string,
    options: {
        afterMessageId?: string | null
        ignorePendingRequestId?: string | null
    } = {},
) {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS
    let observedBusy = false
    let settledSince: number | null = null
    while (Date.now() < deadline) {
        const pending = await findPendingStudioInteraction(workingDir, sessionId).catch(() => null)
        if (pending && pending.kind !== 'message') {
            const requestId = pending.request.id
            if (!options.ignorePendingRequestId || requestId !== options.ignorePendingRequestId) {
                return pending
            }
        }
        const status = await getStudioChatSessionStatus(workingDir, sessionId).catch(() => ({ status: null }))
        if (status.status?.type === 'busy' || status.status?.type === 'retry') {
            observedBusy = true
            settledSince = null
        }
        const result = await listStudioSessionMessages(workingDir, sessionId).catch(() => null)
        const latest = result
            ? latestAssistantMessage(result.messages, options.afterMessageId)
            : null
        if (latest?.text) {
            return { kind: 'message', content: latest.text } satisfies DiscordAssistantReply
        }
        if (observedBusy && (status.status?.type === 'idle' || status.status?.type === 'error')) {
            if (settledSince === null) {
                settledSince = Date.now()
            }
            if (Date.now() - settledSince >= SETTLE_IDLE_GRACE_MS) {
                return { kind: 'message', content: 'The Studio session finished without a text reply.' } satisfies DiscordAssistantReply
            }
        } else if (status.status?.type !== 'idle' && status.status?.type !== 'error') {
            settledSince = null
        }
        await sleep(SETTLE_POLL_MS)
    }
    return { kind: 'message', content: 'The Studio session is still running. I will not block this Discord channel any longer.' } satisfies DiscordAssistantReply
}
