import type { ModelSelection } from './model-types.js'
import type { RuntimeModelCatalogEntry } from './model-variants.js'
import type { ProviderSummary } from './provider-auth.js'

export interface OpenCodeHealthResponse {
    connected: boolean
    url: string
    error?: string
    managed?: boolean
    mode?: 'managed'
    restartAvailable?: boolean
    project?: { worktree?: string } | Record<string, unknown> | null
}

export interface OpenCodeRestartResponse {
    ok: true
    managed: true
    mode: 'managed'
}

export interface OpenCodeRuntimeApplyResponse {
    applied: boolean
    blocked: boolean
    runningSessions: number
    disposedDirectories: string[]
}

export interface TerminalShellSummary {
    path: string
    name: string
    acceptable: boolean
}

export interface TerminalShellListResponse {
    shells: TerminalShellSummary[]
}

export interface OpenCodeAgentSummary {
    name: string
    model?: string
    description?: string
    color?: string
    mode?: 'subagent' | 'primary' | 'all'
    hidden?: boolean
    native?: boolean
    variant?: string
}

export interface OpenCodeAgentListResponse {
    agents: OpenCodeAgentSummary[]
}

export interface RuntimeModelListResponse {
    models: RuntimeModelCatalogEntry[]
}

export interface ProviderListResponse {
    providers: ProviderSummary[]
}

export interface OpenCodeProjectConfigResponse {
    exists: boolean
    path: string
    config: Record<string, unknown>
}

export type OpenCodeConfig = Record<string, unknown>
export type OpenCodeConfigUpdateRequest = OpenCodeConfig
export type OpenCodeConfigUpdateResponse = OpenCodeConfig

export interface ProviderAuthStatusResponse {
    ok: true
}

export interface ProviderAuthClearResponse {
    ok: true
}

export interface McpServerSummary {
    name: string
    status: 'connected' | 'disconnected' | 'disabled' | 'failed' | 'needs_auth' | 'needs_client_registration' | 'unknown'
    tools: Array<{ name: string; description?: string }>
    resources: Array<unknown>
    defined?: boolean
    configType?: 'local' | 'remote'
    authStatus?: 'ready' | 'needs_auth' | 'n/a'
    error?: string
    oauthConfigured?: boolean
    clientRegistrationRequired?: boolean
}

export interface McpServerListResponse {
    servers: McpServerSummary[]
}

export interface McpAuthStartResponse {
    authorizationUrl: string
}

export interface McpAuthCallbackRequest {
    code: string
}

export interface McpMutationResponse {
    ok: true
}

export interface VcsStatusResponse {
    branch?: string | null
}

export interface RuntimeToolUnavailableDetail {
    serverName: string
    reason: 'not_defined' | 'shadowed_by_project' | 'needs_auth' | 'needs_client_registration' | 'connect_failed'
    toolId?: string
    detail?: string
}

export interface RuntimeToolResolution {
    selectedMcpServers: string[]
    requestedTools: string[]
    availableTools: string[]
    resolvedTools: string[]
    unavailableTools: string[]
    unavailableDetails: RuntimeToolUnavailableDetail[]
}

export interface RuntimeToolResolveRequest {
    model?: ModelSelection | null
    mcpServerNames?: string[]
}

export interface QuotaWindow {
    percentUsed: number
    resetsAt: string | null
}

export interface ProviderQuota {
    connected: boolean
    authType: 'oauth' | 'api' | null
    fiveHour?: QuotaWindow
    sevenDay?: QuotaWindow
    weekly?: QuotaWindow
    error?: string
}

export interface StudioUsageSummary {
    totalCostUsd: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
}

export interface UsageResponse {
    studio: StudioUsageSummary
    codex: ProviderQuota
}

export interface OpenCodeFileReadResponse {
    content?: string
}

export interface FileStatusSummary {
    path: string
    added: number
    removed: number
    status: 'added' | 'deleted' | 'modified'
}

export interface FileListEntry {
    name?: string
    path?: string
    absolute?: string
    type?: string
    isDirectory?: boolean
    size?: number
    modified?: number
}

export interface FindTextMatch {
    path?: string
    line?: number
    column?: number
    text?: string
    match?: string
    preview?: string
}

export interface FindSymbolMatch {
    name?: string
    path?: string
    kind?: string
    line?: number
    column?: number
    containerName?: string
}

export interface FileListResponse {
    entries: FileListEntry[]
}

export interface FileStatusResponse {
    files: FileStatusSummary[]
}

export interface FindTextResponse {
    matches: FindTextMatch[]
}

export interface FindFilesResponse {
    files: string[]
}

export interface FindSymbolsResponse {
    symbols: FindSymbolMatch[]
}
