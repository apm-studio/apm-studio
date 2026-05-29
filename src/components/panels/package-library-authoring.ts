import type { DraftPrimitive } from '../../lib/primitive-types'
// Primitive authoring and draft payload builders for the Packages


import type { PackagePrimitive } from './package-panel-types'
import type { PackagePrimitiveKind } from './package-library-utils'
import type { AgentDraftContent, TeamDraftContent } from '../../../shared/draft-contracts'
import type { ModelConfigV1 } from '../../../shared/model-types'
import type { TeamParticipantV1, TeamRelation, TeamRelationV1 } from '../../../shared/team-types'

export function buildDraftPackageCards(
    drafts: Record<string, DraftPrimitive>,
    packageKind: PackagePrimitiveKind,
): PackagePrimitive[] {

    return Object.values(drafts)
        .filter((draft): draft is DraftPrimitive => !!draft && draft.kind === packageKind && draft.saveState === 'saved')
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((draft) => {
            const draftContent = draft.kind === 'agent'
                ? { draftContent: draft.content as AgentDraftContent }
                : draft.kind === 'team'
                    ? { draftContent: draft.content as TeamDraftContent }
                    : {}
            return {
                kind: draft.kind,
                urn: `draft/${draft.id}`,
                draftId: draft.id,
                name: draft.name,
                author: '@draft',
                description: draft.description || draft.name,
                source: 'draft',
                tags: Array.isArray(draft.tags) ? draft.tags : [],
                content: typeof draft.content === 'string' ? draft.content : '',
                ...draftContent,
            } as PackagePrimitive
        })
}

type AuthorablePrimitive = {
    kind: PackagePrimitiveKind
    name: string
    description?: string
    tags?: string[]
    content?: string
    instructionUrn?: string | null
    skillUrns?: string[]
    teamUrn?: string | null
    model?: ModelConfigV1 | null
    modelVariant?: string | null
    mcpConfig?: Record<string, unknown> | null
    participants?: TeamParticipantV1[]
    relations?: Array<TeamRelation | TeamRelationV1>
    teamRules?: string[]
    slug?: string
}

export function buildAuthoringPayloadFromPrimitive(item: AuthorablePrimitive) {
    if (item.kind === 'instruction' || item.kind === 'skill') {
        return {
            description: item.description || item.name,
            tags: Array.isArray(item.tags) ? item.tags : [],
            content: typeof item.content === 'string' ? item.content : '',
        }
    }

    if (item.kind === 'agent') {
        return {
            description: item.description || item.name,
            tags: Array.isArray(item.tags) ? item.tags : [],
            ...(item.instructionUrn ? { instruction: item.instructionUrn } : {}),
            ...(Array.isArray(item.skillUrns) && item.skillUrns.length > 0
                ? { skills: item.skillUrns }
                : {}),
            ...(item.model ? { model: item.model } : {}),
            ...(item.modelVariant ? { modelVariant: item.modelVariant } : {}),
            ...(item.mcpConfig ? { mcp_config: item.mcpConfig } : {}),
        }
    }

    if (item.kind === 'team') {
        return {
            description: item.description || item.name,
            tags: Array.isArray(item.tags) ? item.tags : [],
            teamRules: Array.isArray(item.teamRules) ? item.teamRules : [],
            participants: item.participants || [],
            relations: (item.relations || []).map((relation) => ({
                between: relation.between,
                direction: relation.direction,
                name: relation.name,
                description: relation.description,
            })),
        }
    }

    throw new Error(`Unsupported primitive kind '${item.kind}' for authoring action.`)
}
