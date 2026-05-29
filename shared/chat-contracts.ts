import type { AssistantWorkspaceContext } from './assistant-actions.js'
import type { ModelCapabilities } from './model-types.js'
import type { RuntimeToolResolution } from './opencode-contracts.js'
import type { ProjectionDirtyPatch } from './projection-dirty.js'

export type SharedPrimitiveRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }

export type CompilePromptRequest = {
    agentId?: string
    agentName?: string
    instructionRef: SharedPrimitiveRef | null
    agentBody?: string | null
    skillRefs: SharedPrimitiveRef[]
    model: {
        provider: string
        modelId: string
    } | null
    modelVariant?: string | null
    runtimeAgentId?: string | null
    mcpServerNames?: string[]
    planMode?: boolean
    requestTargets?: Array<{
        agentId: string
        agentName: string
        description?: string
    }>
}

export interface SkillCatalogEntry {
    urn: string
    description: string
    loadMode: 'tool' | 'inline'
    inlineContent?: string
}

export interface PromptPreview {
    system: string
    agent: string
    instructionStack?: Array<{
        label: string
        detail: string
    }>
    skillCatalog: SkillCatalogEntry[]
    capabilitySnapshot: ModelCapabilities | null
    toolName?: string
    toolResolution?: RuntimeToolResolution
}

export type ChatSessionCreateRequest = {
    agentId: string
    agentName: string
    configHash: string
    teamId?: string
}

export type ChatSessionCreateResponse = {
    sessionId: string
    title: string
}

export type ChatOkResponse = {
    ok: true
}

export type ChatSessionUpdateRequest = {
    title: string
}

export type ChatSessionUpdateResponse = ChatOkResponse & {
    title: string
    sidebarTitle?: string
}

export type ChatSessionStatus = {
    type: 'idle' | 'busy' | 'retry' | 'error'
    message?: string
}

export type ChatSessionStatusResponse = {
    status: ChatSessionStatus | null
}

export type ChatSessionSummary = {
    id: string
    title?: string
    sidebarTitle?: string
    createdAt?: number
    updatedAt?: number
    parentId?: string | null
    status?: ChatSessionStatus['type']
}

export type ChatSessionListResponse = {
    sessions: ChatSessionSummary[]
}

export type ChatSessionResolveResponse =
    | { found: false }
    | { found: true; sessionId: string; ownerId: string; ownerKind: string }

export type ChatSessionPermissionReply = 'once' | 'always' | 'reject'

export type ChatSessionPermissionRespondRequest = {
    response: ChatSessionPermissionReply
}

export type ChatQuestionAnswer = string[]

export type ChatQuestionRespondRequest = {
    answers: ChatQuestionAnswer[]
}

export type ChatPermissionRequest = {
    id: string
    sessionId: string
    permission: string
    patterns: string[]
    metadata: Record<string, unknown>
    always: string[]
    tool?: {
        messageId: string
        callId: string
    }
}

export type ChatQuestionOption = {
    label: string
    description: string
}

export type ChatQuestionInfo = {
    question: string
    header: string
    options: ChatQuestionOption[]
    multiple?: boolean
    custom?: boolean
}

export type ChatQuestionRequest = {
    id: string
    sessionId: string
    questions: ChatQuestionInfo[]
    tool?: {
        messageId: string
        callId: string
    }
}

export type ChatTodo = {
    content: string
    status: string
    priority: string
}

export type ChatSummarizeRequest = {
    providerId?: string
    modelId?: string
    auto?: boolean
}

export type ChatSummarizeResponse = ChatOkResponse & {
    summarized: boolean
}

export type ChatSessionTodosResponse = {
    todos: ChatTodo[]
}

export type ChatPendingPermissionsResponse = {
    permissions: ChatPermissionRequest[]
}

export type ChatPendingQuestionsResponse = {
    questions: ChatQuestionRequest[]
}

export type ChatRevertRequest = {
    messageId: string
    partId?: string
}

export type ChatSessionDiffStatus = 'added' | 'modified' | 'deleted'

export interface ChatSessionDiffEntry {
    file: string
    before: string
    after: string
    additions: number
    deletions: number
    status: ChatSessionDiffStatus
    rawDiff?: string
}

export type ChatSessionDiffResponse = {
    diffs: ChatSessionDiffEntry[]
}

export type ChatSessionRevertState = {
    messageId: string
    partId?: string
}

export type ChatSessionRevertResponse = ChatOkResponse & {
    revert?: ChatSessionRevertState | null
}

export type ChatSessionUnrevertResponse = ChatOkResponse

export type ChatSessionToolError =
    | string
    | {
        data?: {
            message?: string
            isRetryable?: boolean
        }
        message?: string
    }

export type ChatSessionRole = 'user' | 'assistant' | 'system'

export type ChatSessionMessagePartType =
    | 'text'
    | 'reasoning'
    | 'tool'
    | 'step-start'
    | 'step-finish'
    | 'compaction'
    | 'file'

export type ChatSessionMessagePart = {
    id?: string
    type: ChatSessionMessagePartType
    text?: string
    filename?: string
    mime?: string
    url?: string
    tool?: string
    callId?: string
    state?: {
        status?: string
        title?: string
        input?: Record<string, unknown>
        metadata?: Record<string, unknown>
        output?: string
        error?: ChatSessionToolError
        time?: { start: number; end?: number }
    }
    reason?: string
    cost?: number
    tokens?: {
        input: number
        output: number
        reasoning: number
        cache?: { read: number; write: number }
    }
    auto?: boolean
    overflow?: boolean
}

export type ChatSessionMessage = {
    id?: string
    role?: ChatSessionRole
    agent?: string
    content?: string
    model?: {
        providerId?: string
        modelId?: string
        variant?: string
    }
    error?: {
        data?: {
            message?: string
            isRetryable?: boolean
        }
        message?: string
    }
    parts?: ChatSessionMessagePart[]
    text?: string
    createdAt?: number
    completedAt?: number
}

export type ChatSessionMessagesRequest = {
    limit?: number
    before?: string
}

export type ChatSessionMessagesResponse = {
    messages: ChatSessionMessage[]
    nextCursor: string | null
}

export type ChatSendRequest = {
    message: string
    projectionScope?: ProjectionDirtyPatch | null
    agent: {
        agentId: string
        agentName: string
        instructionRef: SharedPrimitiveRef | null
        agentBody?: string | null
        skillRefs: SharedPrimitiveRef[]
        extraSkillRefs?: SharedPrimitiveRef[]
        model?: {
            provider: string
            modelId: string
        } | null
        modelVariant?: string | null
        runtimeAgentId?: string | null
        mcpServerNames?: string[]
        planMode?: boolean
        configHash?: string
    }
    attachments?: Array<{ type: 'file'; mime: string; url: string; filename?: string }>
    teamId?: string
    /** Thread within Team, used for team runtime context. */
    teamThreadId?: string
    assistantContext?: AssistantWorkspaceContext | null
}

export type ChatSendResponse = {
    accepted: true
}
