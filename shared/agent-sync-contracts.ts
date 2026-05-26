import type { ModelSelection } from './model-types.js'

export type AgentSyncStatus = 'synced' | 'stale' | 'unsupported' | 'invalid' | 'failed'

export interface AgentSyncStatusCounts {
    synced: number
    stale: number
    unsupported: number
    invalid: number
    failed: number
}

export interface AgentSyncProviderSummary {
    id: string
    label: string
    available: boolean
    statusCounts: AgentSyncStatusCounts
    staleArtifactsCount: number
    lastCheckedAt: number
}

export interface AgentSyncPerformerStatus {
    providerId: string
    performerId: string
    performerName: string
    model: ModelSelection | null
    status: AgentSyncStatus
    reason: string
    lastSyncedAt?: number
    agentName?: string
}

export interface AgentSyncOverview {
    providers: AgentSyncProviderSummary[]
    performers: AgentSyncPerformerStatus[]
}

export interface AgentSyncRunRequest {
    performerIds?: string[]
}

export interface AgentSyncRunResult extends AgentSyncPerformerStatus {
    changed: boolean
    skipped: boolean
}

export interface AgentSyncRunResponse {
    providerId: string
    projectedCount: number
    skippedCount: number
    failedCount: number
    changedCount: number
    staleArtifactsPrunedCount: number
    results: AgentSyncRunResult[]
}
