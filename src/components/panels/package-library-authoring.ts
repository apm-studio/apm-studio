import type { DraftPrimitive } from '../../lib/primitive-types'
// Draft package card builders for the Packages drawer.

import type { PackagePrimitive } from './package-panel-types'
import type { PackagePrimitiveKind } from './package-library-utils'
import type { AgentDraftContent, TeamDraftContent } from '../../../shared/draft-contracts'

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
