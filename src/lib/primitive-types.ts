import type { AgentDraftContent, DraftFile, TeamDraftContent } from '../../shared/draft-contracts'
import type { RuntimeModelVariant } from '../../shared/model-variants'
import type { GitHubSkillSourceInfo } from '../../shared/package-source-contracts'
import type {
    TeamParticipantV1 as InstalledTeamParticipant,
    TeamRelationV1 as InstalledTeamRelation,
} from '../../shared/team-types'
import type { WorkspaceModelConfig } from '../../shared/workspace-contracts'

export type PackageLibraryItemKind =
    | 'instruction'
    | 'skill'
    | 'agent'
    | 'team'
    | 'model'
    | 'mcp'

export interface PackageLibraryItem {
    kind: PackageLibraryItemKind
    urn: string
    slug?: string
    name: string
    author: string
    description?: string
    source?: 'user' | 'workspace' | 'registry' | 'draft'
    tags?: string[]
    content?: string
    draftId?: string
    draftContent?: AgentDraftContent | TeamDraftContent
    skillUrns?: string[]
    teamRules?: string[]
    teamUrn?: string | null
    model?: WorkspaceModelConfig | null
    modelVariant?: string | null
    mcpConfig?: Record<string, unknown> | null
    declaredMcpServerNames?: string[]
    matchedMcpServerNames?: string[]
    missingMcpServerNames?: string[]
    participantCount?: number
    relationCount?: number
    participants?: InstalledTeamParticipant[]
    relations?: InstalledTeamRelation[]
    stars?: number
    tier?: string
    updatedAt?: string
    github?: GitHubSkillSourceInfo
    connected?: boolean
    context?: number
    output?: number
    provider?: string
    providerName?: string
    id?: string
    toolCall?: boolean
    reasoning?: boolean
    attachment?: boolean
    temperature?: boolean
    modalities?: {
        input: string[]
        output: string[]
    }
    variants?: RuntimeModelVariant[]
    tools?: Array<{ name: string; description?: string }>
    resources?: Array<unknown>
}

export type DraftPrimitive = DraftFile & {
    saveState: 'unsaved' | 'saved'
}
