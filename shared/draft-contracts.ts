// Draft CRUD — Shared contracts between client and server

import type { SharedPrimitiveRef } from './chat-contracts.js'
import type {
    WorkspaceModelConfig,
    WorkspacePoint,
    WorkspaceTeamMetadata,
} from './workspace-contracts.js'
import type {
    ParticipantSubscriptions,
    TeamRelation,
    TeamSafetyConfig,
} from './team-types.js'

export type DraftKind = 'instruction' | 'skill' | 'agent' | 'team'

// ── Content shapes ──────────────────────────────────────

/**
 * Agent draft content shape (when DraftFile.kind === 'agent').
 */
export interface AgentDraftContent {
    agentBody?: string | null
    skillRefs: SharedPrimitiveRef[]
    model: WorkspaceModelConfig | null
    modelVariant?: string | null
    mcpServerNames: string[]
    mcpBindingMap?: Record<string, string>
    planMode?: boolean
    runtimeAgentId?: string | null
}

/**
 * Team draft content shape (when DraftFile.kind === 'team').
 * Participant graph only; no standalone runtime-mode settings.
 */
export interface TeamDraftContent {
    description?: string
    teamRules?: string[]
    participants: Record<string, TeamDraftParticipantBinding>
    relations: TeamRelation[]
    /** Authoring state — preserved across draft save/load round-trip */
    position?: WorkspacePoint
    width?: number
    height?: number
    hidden?: boolean
    safety?: TeamSafetyConfig & {
        confirmModeEnabled?: boolean
        cooldownMs?: number
    }
    meta?: WorkspaceTeamMetadata
}

export interface TeamDraftParticipantBinding {
    agentRef: SharedPrimitiveRef
    displayName?: string
    subscriptions?: ParticipantSubscriptions
    /** Participant canvas position — preserved across draft save/load round-trip */
    position?: WorkspacePoint
}

/** Map from draft kind to its typed content */
export interface DraftContentMap {
    instruction: string
    skill: string
    agent: AgentDraftContent
    team: TeamDraftContent
}

export type DraftContent = DraftContentMap[DraftKind]

/**
 * A draft file stored at `.apm-studio/drafts/<kind>/<id>.json`.
 * Drafts are project-local only — no global scope.
 */
export interface DraftFile<T = DraftContent> {
    id: string
    kind: DraftKind
    name: string
    /** string for instruction/skill markdown content; object for agent/team config */
    content: T
    slug?: string
    description?: string
    tags?: string[]
    /** Original URN if this draft was created by modifying a named primitive */
    derivedFrom?: string | null
    createdAt: number
    updatedAt: number
    /** 1 = JSON draft file, 2 = bundle directory (Skill only) */
    formatVersion?: number
}

/** Convenience: typed DraftFile for a specific kind */
export type TypedDraftFile<K extends DraftKind> = DraftFile<DraftContentMap[K]>

// ── CRUD Request / Response types ────────────────────────

type DraftMetadataRequestFields = {
    name: string
    /** Optional: caller-specified ID. If omitted, generated server-side. */
    id?: string
    slug?: string
    description?: string
    tags?: string[]
    derivedFrom?: string | null
}

export type CreateDraftRequest<K extends DraftKind = DraftKind> = K extends DraftKind
    ? DraftMetadataRequestFields & {
        kind: K
        content: DraftContentMap[K]
    }
    : never

export type UpdateDraftRequest<K extends DraftKind = DraftKind> = {
    name?: string
    content?: DraftContentMap[K]
    slug?: string
    description?: string
    tags?: string[]
    derivedFrom?: string | null
}

export interface DraftListResponse {
    drafts: DraftFile[]
}

export interface DraftResponse {
    draft: DraftFile
}

export interface DraftDeleteRequest {
    cascade?: boolean
}

export interface DraftDeleteResponse {
    ok: true
    deletedIds: string[]
}

export interface DraftDependencyPlanItem {
    draftId: string
    kind: DraftKind
    name: string
    source: 'draft'
    reason: string
}

export interface DraftDeletePreviewResponse {
    target: DraftDependencyPlanItem
    dependents: DraftDependencyPlanItem[]
}

// ── Skill Bundle Types ──────────────────────────────────

export interface BundleTreeEntry {
    name: string
    type: 'file' | 'directory'
    /** Relative path from bundle root */
    path: string
    children?: BundleTreeEntry[]
}

export interface BundleTreeResponse {
    tree: BundleTreeEntry[]
}

export interface BundleFileReadResponse {
    path: string
    content: string
}

export interface BundleFileWriteRequest {
    path: string
    content: string
}

export interface BundleFileCreateRequest {
    path: string
    isDirectory?: boolean
}

export interface BundleFileDeleteRequest {
    path: string
}

export interface BundleFileOperationResponse {
    ok: true
    path: string
}

export type BundleFolderOpenResponse = BundleFileOperationResponse
