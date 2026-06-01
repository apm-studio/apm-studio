import type { PackageLibraryItem } from '../../lib/primitive-types'
import type { PackageSource, GitHubSkillSourceInfo } from '../../../shared/package-source-contracts'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { ModelConfigV1 } from '../../../shared/model-types'
import type { ApmPackageScope, ApmPackageSummary } from '../../../shared/apm-contracts'
import type { AgentDraftContent, TeamDraftContent } from '../../../shared/draft-contracts'
import type { TeamParticipantV1, TeamRelation, TeamRelationV1 } from '../../../shared/team-types'
import type { McpServerSummary } from '../../../shared/opencode-contracts'

type PackagePrimitiveKind = 'agent' | 'instruction' | 'skill' | 'team'

type PanelItemSharedFields = {
    urn?: string
    slug?: string
    author?: string
    source?: PackageSource
    description?: string
    desc?: string
    tags?: string[]
    content?: string
    body?: string
    instructions?: string
    skillUrns?: string[]
    teamUrn?: string | null
    model?: ModelConfigV1 | null
    modelVariant?: string | null
    mcpConfig?: Record<string, unknown> | null
    declaredMcpServerNames?: string[]
    matchedMcpServerNames?: string[]
    missingMcpServerNames?: string[]
    participantCount?: number
    participants?: TeamParticipantV1[]
    relations?: Array<TeamRelation | TeamRelationV1>
    relationCount?: number
    teamRules?: string[]
    provider?: string
    providerName?: string
    id?: string
    connected?: boolean
    context?: number
    output?: number
    toolCall?: boolean
    reasoning?: boolean
    attachment?: boolean
    temperature?: boolean
    modalities?: {
        input: string[]
        output: string[]
    }
    tools?: Array<{ name: string; description?: string }>
    resources?: Array<unknown>
    status?: McpServerSummary['status']
    defined?: boolean
    configType?: McpServerSummary['configType']
    authStatus?: McpServerSummary['authStatus']
    error?: string
    oauthConfigured?: boolean
    clientRegistrationRequired?: boolean
    draftId?: string
    draftContent?: AgentDraftContent | TeamDraftContent
    stars?: number
    tier?: string
    updatedAt?: string
    github?: GitHubSkillSourceInfo
}

export type PackagePrimitive = PackageLibraryItem & { kind: PackagePrimitiveKind } & PanelItemSharedFields

export type ScopedApmPackageSummary = ApmPackageSummary & {
    scope: ApmPackageScope
}

export type ModelPanelItem = RuntimeModelCatalogEntry & PanelItemSharedFields & {
    kind: 'model'
    name: string
}

export type McpPanelItem = McpServerSummary & PanelItemSharedFields & {
    kind: 'mcp'
}

export type PackagePanelItem = PackagePrimitive | ModelPanelItem | McpPanelItem

export type PackagePanelHandler = (item: PackagePanelItem) => void | Promise<void>
