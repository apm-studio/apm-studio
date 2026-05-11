import type { QuestionAnswer, PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2'
import type { ActThreadSummary } from '../../../shared/act-types.js'
import { buildActParticipantChatKey } from '../../../shared/chat-targets.js'
import type { ChatSendRequest, SharedAssetRef } from '../../../shared/chat-contracts.js'
import { buildActDefinition, resolvePerformerFromActBindingInput } from '../../../shared/act-definition-builder.js'
import { parseStudioSessionTitle } from '../../../shared/session-metadata.js'
import {
    buildPerformerConfigHash,
    resolvePerformerRuntimeConfig,
    type PerformerRuntimeConfigInput,
} from '../../../shared/runtime-config.js'
import {
    getStudioChatSessionStatus,
    listStudioChatSessions,
    listPendingPermissions,
    listPendingQuestions,
    listStudioSessionMessages,
    rejectQuestion,
    respondQuestion,
    respondSessionPermission,
} from '../chat-session-service.js'
import { createStudioChatSession, sendStudioChatMessage } from '../chat-service.js'
import { getActRuntimeService } from '../act-runtime/act-runtime-service.js'
import { listSessionOwnershipsForWorkingDir } from '../session-ownership-service.js'
import { unnamedThreadNameFor } from './sync-plan.js'

export type DiscordWorkspaceSnapshot = {
    schemaVersion?: number
    workingDir: string
    performers?: DiscordPerformerSnapshot[]
    acts?: DiscordActSnapshot[]
}

export type DiscordPerformerSnapshot = PerformerRuntimeConfigInput & {
    id: string
    name: string
    meta?: {
        derivedFrom?: string | null
        authoring?: {
            description?: string
        }
    }
}

export type DiscordActParticipantBinding = {
    performerRef: SharedAssetRef
    displayName?: string
    subscriptions?: Record<string, unknown>
    description?: string
}

export type DiscordActSnapshot = {
    id: string
    name: string
    description?: string
    actRules?: string[]
    participants: Record<string, DiscordActParticipantBinding>
    relations: Array<{
        id: string
        between: [string, string]
        direction: 'both' | 'one-way'
        name: string
        description: string
    }>
    safety?: Record<string, unknown>
}

const SETTLE_TIMEOUT_MS = 10 * 60_000
const SETTLE_POLL_MS = 1_000
const SETTLE_IDLE_GRACE_MS = 4_000

export type DiscordAssistantReply =
    | { kind: 'message'; content: string }
    | { kind: 'permission'; request: PermissionRequest }
    | { kind: 'question'; request: QuestionRequest }

export type DiscordBackfillMessage = {
    id: string
    content: string
}

export type DiscordStandaloneThreadSummary = {
    id: string
    name: string
    status?: string
    createdAt?: number
    updatedAt?: number
}

export type DiscordSessionBlock = {
    blocked: boolean
    reason?: 'running' | 'permission' | 'question'
    message?: string
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function findWorkspacePerformer(snapshot: DiscordWorkspaceSnapshot, performerId: string) {
    return (snapshot.performers || []).find((performer) => performer.id === performerId) || null
}

export function findWorkspaceAct(snapshot: DiscordWorkspaceSnapshot, actId: string) {
    return (snapshot.acts || []).find((act) => act.id === actId) || null
}

export function resolveActParticipantPerformer(
    snapshot: DiscordWorkspaceSnapshot,
    act: DiscordActSnapshot,
    participantKey: string,
) {
    const binding = act.participants?.[participantKey]
    return resolvePerformerFromActBindingInput(snapshot.performers || [], binding) as DiscordPerformerSnapshot | null
}

export function buildDiscordActDefinition(act: DiscordActSnapshot, snapshot: DiscordWorkspaceSnapshot) {
    return buildActDefinition(act, snapshot.performers || [])
}

function latestAssistantMessage(messages: Array<Record<string, unknown>>, afterMessageId?: string | null) {
    for (const message of [...messages].reverse()) {
        const id = messageId(message, '')
        if (afterMessageId && id === afterMessageId) {
            return null
        }

        const info = message.info && typeof message.info === 'object' ? message.info as Record<string, unknown> : null
        const role = info?.role || message.role
        if (role !== 'assistant') {
            continue
        }

        const parts = Array.isArray(message.parts) ? message.parts : []
        const text = parts
            .filter((part): part is { type?: unknown; text?: unknown } => !!part && typeof part === 'object')
            .filter((part) => part.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text)
            .join('\n')
            .trim()
        if (text) {
            return { id, text }
        }

        if (typeof message.text === 'string' && message.text.trim()) {
            return { id, text: message.text.trim() }
        }
    }
    return null
}

function messageRole(message: Record<string, unknown>) {
    const info = message.info && typeof message.info === 'object' ? message.info as Record<string, unknown> : null
    const role = info?.role || message.role
    return typeof role === 'string' ? role : ''
}

function messageId(message: Record<string, unknown>, fallback: string) {
    if (typeof message.id === 'string' && message.id.trim()) {
        return message.id.trim()
    }
    const info = message.info && typeof message.info === 'object' ? message.info as Record<string, unknown> : null
    if (typeof info?.id === 'string' && info.id.trim()) {
        return info.id.trim()
    }
    return fallback
}

function visibleTextFromMessage(message: Record<string, unknown>) {
    const parts = Array.isArray(message.parts) ? message.parts : []
    const text = parts
        .filter((part): part is { type?: unknown; text?: unknown } => !!part && typeof part === 'object')
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
    if (typeof message.content === 'string' && message.content.trim()) {
        return message.content.trim()
    }
    return ''
}

export async function listDiscordBackfillMessages(params: {
    workingDir: string
    sessionId: string
    assistantLabel: string
    knownMessageIds?: string[]
    limit?: number
    includeUserMessages?: boolean
}) {
    const result = await listStudioSessionMessages(params.workingDir, params.sessionId, { limit: 80 })
    return formatDiscordBackfillMessages({
        sessionId: params.sessionId,
        assistantLabel: params.assistantLabel,
        messages: result.messages as Array<Record<string, unknown>>,
        knownMessageIds: params.knownMessageIds,
        limit: params.limit,
        includeUserMessages: params.includeUserMessages,
    })
}

export function formatDiscordBackfillMessages(params: {
    sessionId: string
    assistantLabel: string
    messages: Array<Record<string, unknown>>
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
            const label = role === 'assistant' ? params.assistantLabel : 'Studio User'
            return {
                id,
                content: `**[${label}]**\n${text}`,
            }
        })
        .filter((message): message is DiscordBackfillMessage => !!message)
    return visible.slice(-(params.limit || 20))
}

export async function listStandaloneThreadsForDiscord(workingDir: string, performerId: string): Promise<DiscordStandaloneThreadSummary[]> {
    const [ownerships, sessions] = await Promise.all([
        listSessionOwnershipsForWorkingDir(workingDir, 'performer'),
        listStudioChatSessions(workingDir).catch(() => null),
    ])
    const sessionsById = sessions ? new Map(sessions.map((session) => [session.id, session])) : null
    const threads = ownerships
        .filter((ownership) => ownership.ownerId === performerId)
        .map((ownership): DiscordStandaloneThreadSummary | null => {
            const session = sessionsById?.get(ownership.sessionId) || null
            if (sessionsById && !session) {
                return null
            }
            const metadataTitle = parseStudioSessionTitle(session?.title)
            const name = ownership.sidebarTitle?.trim()
                || session?.sidebarTitle?.trim()
                || (!metadataTitle ? session?.title?.trim() : undefined)
            return {
                id: ownership.sessionId,
                name: name || '',
                ...(session?.status ? { status: session.status } : {}),
                ...(session?.createdAt ? { createdAt: session.createdAt } : {}),
                updatedAt: session?.updatedAt || ownership.updatedAt,
            }
        })
        .filter((thread): thread is DiscordStandaloneThreadSummary => !!thread)
    return threads
        .map((thread) => ({
            ...thread,
            name: thread.name.trim() || unnamedThreadNameFor(threads, thread.id),
        }))
        .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
}

export async function getLatestDiscordAssistantMessageId(workingDir: string, sessionId: string) {
    const result = await listStudioSessionMessages(workingDir, sessionId)
    return latestAssistantMessage(result.messages as Array<Record<string, unknown>>)?.id || null
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
            ? latestAssistantMessage(result.messages as Array<Record<string, unknown>>, options.afterMessageId)
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

export async function findPendingStudioInteraction(workingDir: string, sessionId: string): Promise<DiscordAssistantReply | null> {
    const permissions = await listPendingPermissions(workingDir)
    const permission = permissions.find((request) => request.sessionID === sessionId)
    if (permission) {
        return { kind: 'permission', request: permission }
    }

    const questions = await listPendingQuestions(workingDir)
    const question = questions.find((request) => request.sessionID === sessionId)
    if (question) {
        return { kind: 'question', request: question }
    }

    return null
}

export async function respondDiscordPermission(params: {
    workingDir: string
    sessionId: string
    permissionId: string
    response: 'once' | 'always' | 'reject'
}) {
    return respondSessionPermission(params.workingDir, params.sessionId, params.permissionId, params.response)
}

export async function respondDiscordQuestion(workingDir: string, questionId: string, answers: QuestionAnswer[]) {
    return respondQuestion(workingDir, questionId, answers)
}

export async function rejectDiscordQuestion(workingDir: string, questionId: string) {
    return rejectQuestion(workingDir, questionId)
}

export async function ensureStandaloneSession(params: {
    workingDir: string
    performer: DiscordPerformerSnapshot
    sessionId?: string
}) {
    if (params.sessionId) {
        return params.sessionId
    }
    const session = await createStudioChatSession(params.workingDir, {
        performerId: params.performer.id,
        performerName: params.performer.name,
        configHash: buildPerformerConfigHash(params.performer),
    })
    return session.sessionId
}

export async function ensureActParticipantSession(params: {
    workingDir: string
    actId: string
    thread: ActThreadSummary
    participantKey: string
    performer: DiscordPerformerSnapshot
}) {
    const existing = params.thread.participantSessions?.[params.participantKey]
    if (existing) {
        return existing
    }
    const chatKey = buildActParticipantChatKey(params.actId, params.thread.id, params.participantKey)
    const session = await createStudioChatSession(params.workingDir, {
        performerId: chatKey,
        performerName: params.performer.name,
        configHash: buildPerformerConfigHash(params.performer),
        actId: params.actId,
    })
    return session.sessionId
}

export async function sendPerformerDiscordMessage(params: {
    workingDir: string
    sessionId: string
    performer: DiscordPerformerSnapshot
    message: string
}) {
    const runtimeConfig = resolvePerformerRuntimeConfig(params.performer)
    await sendStudioChatMessage(params.workingDir, params.sessionId, {
        message: params.message,
        performer: {
            performerId: params.performer.id,
            performerName: params.performer.name,
            talRef: runtimeConfig.talRef,
            danceRefs: runtimeConfig.danceRefs,
            model: runtimeConfig.model,
            modelVariant: runtimeConfig.modelVariant,
            agentId: runtimeConfig.agentId,
            mcpServerNames: runtimeConfig.mcpServerNames,
            planMode: runtimeConfig.planMode,
            configHash: buildPerformerConfigHash(params.performer),
        },
    } satisfies ChatSendRequest)
}

export async function sendActParticipantDiscordMessage(params: {
    workingDir: string
    sessionId: string
    actId: string
    threadId: string
    participantKey: string
    performer: DiscordPerformerSnapshot
    message: string
}) {
    const runtimeConfig = resolvePerformerRuntimeConfig(params.performer)
    const chatKey = buildActParticipantChatKey(params.actId, params.threadId, params.participantKey)
    await sendStudioChatMessage(params.workingDir, params.sessionId, {
        message: params.message,
        performer: {
            performerId: chatKey,
            performerName: params.performer.name,
            talRef: runtimeConfig.talRef,
            danceRefs: runtimeConfig.danceRefs,
            model: runtimeConfig.model,
            modelVariant: runtimeConfig.modelVariant,
            agentId: runtimeConfig.agentId,
            mcpServerNames: runtimeConfig.mcpServerNames,
            planMode: runtimeConfig.planMode,
            configHash: buildPerformerConfigHash(params.performer),
        },
        actId: params.actId,
        actThreadId: params.threadId,
    } satisfies ChatSendRequest)
}

export async function listActThreadsForDiscord(workingDir: string, actId: string) {
    return getActRuntimeService(workingDir).listThreads(actId)
}

export async function createActThreadForDiscord(workingDir: string, act: DiscordActSnapshot, snapshot: DiscordWorkspaceSnapshot) {
    return getActRuntimeService(workingDir).createThread(act.id, buildDiscordActDefinition(act, snapshot))
}
