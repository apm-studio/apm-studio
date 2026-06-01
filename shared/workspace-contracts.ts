import type { SharedPrimitiveRef } from './chat-contracts.js'
import type { ModelConfigV1 } from './model-types.js'
import type { ParticipantSubscriptions, TeamRelation, TeamSafetyConfig } from './team-types.js'

export type WorkspacePoint = {
    x: number
    y: number
}

export type WorkspaceModelConfig = ModelConfigV1 & {
    temperature?: number
    maxTokens?: number
}

export type WorkspaceAgentScope = 'shared'

export interface WorkspaceAuthoringMetadata {
    slug?: string
    description?: string
    tags?: string[]
}

export interface WorkspaceAgentMetadata {
    derivedFrom?: string | null
    sourceBindingUrn?: string | null
    authoring?: WorkspaceAuthoringMetadata
}

export interface WorkspaceTeamMetadata {
    derivedFrom?: string | null
    authoring?: WorkspaceAuthoringMetadata
}

export interface WorkspaceAgentSnapshot {
    id: string
    name: string
    position?: WorkspacePoint
    width?: number
    height?: number
    scope?: WorkspaceAgentScope
    model: WorkspaceModelConfig | null
    modelPlaceholder?: WorkspaceModelConfig | null
    modelVariant?: string | null
    agentBody?: string | null
    skillRefs?: SharedPrimitiveRef[]
    mcpServerNames?: string[]
    mcpBindingMap?: Record<string, string>
    declaredMcpConfig?: Record<string, unknown> | null
    runtimeAgentId?: string | null
    planMode?: boolean
    hidden?: boolean
    meta?: WorkspaceAgentMetadata
}

export interface WorkspaceAgentNode extends WorkspaceAgentSnapshot {
    position: WorkspacePoint
    scope: WorkspaceAgentScope
    skillRefs: SharedPrimitiveRef[]
    mcpServerNames: string[]
}

export type WorkspaceMarkdownEditorKind = 'instruction' | 'skill'

export interface WorkspaceMarkdownEditorAttachTarget {
    agentId: string
    mode: 'skill-new' | 'skill-replace'
    targetRef?: SharedPrimitiveRef | null
}

export interface WorkspaceMarkdownEditorNode {
    id: string
    kind: WorkspaceMarkdownEditorKind
    position: WorkspacePoint
    width: number
    height: number
    draftId: string
    baseline: {
        name: string
        slug?: string
        description?: string
        tags?: string[]
        content: string
    } | null
    attachTarget?: WorkspaceMarkdownEditorAttachTarget | null
    hidden?: boolean
}

export interface WorkspaceTeamParticipantBinding {
    agentRef: SharedPrimitiveRef
    displayName?: string
    subscriptions?: ParticipantSubscriptions
    position: WorkspacePoint
}

export interface WorkspaceTeamSnapshot {
    id: string
    name: string
    description?: string
    teamRules?: string[]
    position: WorkspacePoint
    width: number
    height: number
    participants: Record<string, WorkspaceTeamParticipantBinding>
    relations: TeamRelation[]
    safety?: TeamSafetyConfig
    hidden?: boolean
    createdAt: number
    meta?: WorkspaceTeamMetadata
}

export interface WorkspaceCanvasTerminalNode {
    id: string
    title: string
    position: WorkspacePoint
    width: number
    height: number
    sessionId: string | null
    connected: boolean
}

export interface WorkspaceSnapshot {
    schemaVersion?: 1
    workingDir?: string
    hiddenFromList?: boolean
    agents?: WorkspaceAgentSnapshot[]
    chatBindings?: Record<string, string>
    assistantModel?: WorkspaceModelConfig | null
    appliedAssistantActionMessageIds?: Record<string, true>
    assistantActionResults?: Record<string, { applied: number; failed: number }>
    teams?: WorkspaceTeamSnapshot[]
    markdownEditors?: WorkspaceMarkdownEditorNode[]
    canvasTerminals?: WorkspaceCanvasTerminalNode[]
}

export interface SavedWorkspaceSnapshot extends WorkspaceSnapshot {
    schemaVersion: 1
    workingDir: string
    agents: WorkspaceAgentNode[]
    markdownEditors: WorkspaceMarkdownEditorNode[]
}

export interface SavedWorkspaceDocument {
    schemaVersion: 1
    product: 'APM Studio'
    workingDir: string
    hiddenFromList?: boolean
    savedAt: number
    workspace: SavedWorkspaceSnapshot
}

export interface SavedWorkspaceSummary {
    id: string
    workingDir: string
    updatedAt: number
}

export interface SavedWorkspaceListResponse {
    workspaces: SavedWorkspaceSummary[]
}

export interface SaveWorkspaceResponse {
    ok: true
    id: string
    workingDir: string
    updatedAt: number
    hiddenFromList?: boolean
}

export interface SetWorkspaceHiddenRequest {
    hiddenFromList?: boolean
}

export interface SetWorkspaceHiddenResponse {
    ok: true
    id: string
    hiddenFromList: boolean
}

export interface DeleteWorkspaceResponse {
    ok: true
}
