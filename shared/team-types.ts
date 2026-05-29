// Team/workflow runtime shared types.

import type { ApiErrorResponse, ApiErrorStatus } from './api-contracts.js'
import type { SharedPrimitiveRef } from './chat-contracts.js'

export type TeamParticipantSubscriptionsV1 = {
    messagesFrom?: string[]
    messageTags?: string[]
    callboardKeys?: string[]
    eventTypes?: Array<'runtime.idle'>
}

export type TeamParticipantV1 = {
    key: string
    agent: string
    subscriptions?: TeamParticipantSubscriptionsV1
}

export type TeamRelationV1 = {
    between: [string, string]
    direction: 'both' | 'one-way'
    name: string
    description: string
}

/** APM Studio contract re-export: subscriptions schema. */
export type ParticipantSubscriptions = TeamParticipantSubscriptionsV1

// ── Mailbox Messages ────────────────────────────────────

export interface MailboxMessage {
    id: string
    from: string          // participantKey
    to: string            // participantKey
    content: string
    threadId?: string
    correlationId?: string
    tag?: string          // review-request, clarification, approval-needed etc.
    timestamp: number
    status: 'pending' | 'delivered'
}

export type CallboardMessage = MailboxMessage

// ── Board ───────────────────────────────────────────────

export interface BoardEntry {
    id: string
    key: string
    kind: 'artifact' | 'finding' | 'task' | 'note'
    author: string
    sourceType?: 'agent' | 'user' | 'system'
    content: string
    metadata?: Record<string, unknown>
    version: number
    timestamp: number
    pinned?: boolean
    locked?: boolean
    ownership: 'authoritative' | 'collaborative'
    updateMode: 'replace' | 'append'
    writePolicy?: 'author-only' | 'relation-peers' | 'any' | 'user-only'
    status?: 'open' | 'in_progress' | 'done'   // kind='task'
    threadId?: string
    correlationId?: string
}

export type CallboardEntry = BoardEntry
export type TeamWritableBoardKind = 'artifact' | 'finding' | 'task'

// ── Events ──────────────────────────────────────────────

export type MailboxEventType =
    | 'message.sent'
    | 'message.delivered'
    | 'board.posted'
    | 'board.updated'
    | 'runtime.reconfigured'
    | 'runtime.idle'

export interface MailboxEvent {
    id: string
    type: MailboxEventType
    sourceType: 'agent' | 'user' | 'system'
    source: string
    timestamp: number
    payload: Record<string, unknown>
}

export type CallboardEventType = MailboxEventType
export type CallboardEvent = MailboxEvent

// ── WakeCondition ───────────────────────────────────────

export type ConditionExpr =
    | { type: 'all_of'; conditions: ConditionExpr[] }
    | { type: 'any_of'; conditions: ConditionExpr[] }
    | { type: 'board_key_exists'; key: string }
    | { type: 'message_received'; from: string; tag?: string }
    | { type: 'wake_at'; at: number }

export interface WakeCondition {
    id: string
    target: 'self'               // v1: self only
    createdBy: string            // agent who requested
    createdAt?: number
    onSatisfiedMessage: string   // wake-up message on satisfy
    condition: ConditionExpr
    status: 'waiting' | 'triggered' | 'expired'
}

// ── Team Relation (extends APM Studio contract with Studio id)
// APM Studio TeamRelationV1 = { between, direction, name, description }
// Studio adds `id` for internal tracking on the canvas.

export interface TeamRelation extends TeamRelationV1 {
    id: string
}

// ── Team Participant Binding ─────────────────────────────
// APM Studio TeamParticipantV1 uses `agent: string` (package primitive URN).
// Studio uses `agentRef: SharedPrimitiveRef` (resolved ref).
// These are semantically different, so Studio keeps its own type.

export interface TeamParticipantBinding {
    agentRef: SharedPrimitiveRef
    displayName?: string
    description?: string
    subscriptions?: ParticipantSubscriptions
}

// ── Team Safety Config (runtime-only, not in package primitive) ──────

export interface TeamSafetyConfig {
    maxEvents?: number                   // Team Thread total event cap. Default 300
    maxMessagesPerPair?: number          // per agent-pair message cap. Default 20
    maxBoardUpdatesPerKey?: number       // per board key update cap. Default 50
    quietWindowMs?: number               // idle quiet window. Default 45s
    threadTimeoutMs?: number             // Thread timeout. Default 15 min
    loopDetectionThreshold?: number      // ping-pong detection threshold. Default 4
}

// ── Team Definition ──────────────────────────────────────

export interface TeamDefinition {
    id: string
    name: string
    description?: string
    teamRules?: string[]
    participants: Record<string, TeamParticipantBinding>  // participantKey → binding
    relations: TeamRelation[]
    safety?: TeamSafetyConfig
}

// ── Mailbox (runtime state) ─────────────────────────────

export interface MailboxState {
    pendingMessages: MailboxMessage[]
    board: Record<string, BoardEntry>
    wakeConditions: WakeCondition[]
}

export type CallboardState = MailboxState

// ── Team Thread ──────────────────────────────────────────

export type TeamThreadStatus = 'active' | 'idle' | 'completed' | 'interrupted'

export interface TeamParticipantSessionStatus {
    type: 'idle' | 'busy' | 'retry' | 'error'
    updatedAt: number
    message?: string
}

export interface TeamThread {
    id: string
    teamId: string
    name?: string
    mailbox: MailboxState
    participantSessions: Record<string, string>
    participantStatuses: Record<string, TeamParticipantSessionStatus>
    createdAt: number
    status: TeamThreadStatus
}

export type TeamThreadSummary = Pick<
    TeamThread,
    'id' | 'teamId' | 'name' | 'participantSessions' | 'participantStatuses' | 'createdAt' | 'status'
>

// ── Team Runtime HTTP Contracts ─────────────────────────

export interface TeamThreadCreateRequest {
    teamDefinition?: TeamDefinition
}

export interface TeamThreadCreateResponse {
    ok: true
    thread: TeamThreadSummary
}

export interface TeamRuntimeDefinitionPatchRequest {
    teamDefinition: TeamDefinition
}

export interface TeamThreadsResponse {
    ok: true
    threads: TeamThreadSummary[]
}

export interface TeamThreadRenameRequest {
    name: string
}

export interface TeamThreadResponse {
    ok: true
    thread: TeamThreadSummary
}

export interface TeamThreadEventsResponse {
    ok: true
    events: MailboxEvent[]
    total: number
    hasMore: boolean
    nextBefore: number
}

export interface TeamBoardEntriesResponse {
    ok: true
    entries: BoardEntry[]
}

export interface TeamRuntimeDeleteResponse {
    ok: true
}

export type TeamRuntimeErrorStatus = Extract<ApiErrorStatus, 400 | 403 | 404 | 409 | 429>

export interface TeamRuntimeErrorResponse extends ApiErrorResponse {
    ok: false
    status: TeamRuntimeErrorStatus
    error: string
}

export interface TeamSendMessageRequest {
    from: string
    to: string
    content: string
    tag?: string
}

export interface TeamSendMessageResponse {
    ok: true
    messageId: string
}

export interface TeamMessageTeammateRequest {
    recipient: string
    message: string
    tag?: string
}

export interface TeamPostToBoardRequest {
    author: string
    key: string
    kind: TeamWritableBoardKind
    content: string
    updateMode?: 'replace' | 'append'
    metadata?: Record<string, unknown>
}

export interface TeamPostToBoardResponse {
    ok: true
    entryId: string
    version: number
}

export interface TeamBoardEntryResponse {
    ok: true
    entry: BoardEntry
}

export interface TeamUpdateSharedBoardRequest {
    entryKey: string
    entryType: TeamWritableBoardKind
    content: string
    mode?: 'replace' | 'append'
}

export interface TeamSetWakeConditionRequest {
    createdBy: string
    target: 'self'
    onSatisfiedMessage: string
    condition: ConditionExpr
}

export interface TeamWaitUntilRequest {
    resumeWith: string
    condition: ConditionExpr
}

export interface TeamWakeConditionResponse {
    ok: true
    conditionId: string
}

export interface TeamReadBoardRequest {
    key?: string
    limit?: number
    summaryOnly?: boolean
}

export interface TeamListBoardRequest {
    kind?: TeamWritableBoardKind
    limit?: number
    summaryOnly?: boolean
}
