import type { DraftPrimitive } from '../../lib/primitive-types'
import type {
    WorkspaceMarkdownEditorAttachTarget,
    WorkspaceMarkdownEditorNode,
} from '../../../shared/workspace-contracts'
import { equalStringArray, nameToSlug } from './markdown-authoring'

export type MarkdownEditorFrameData = Pick<WorkspaceMarkdownEditorNode, 'draftId' | 'kind' | 'baseline' | 'attachTarget' | 'width' | 'height'> & {
    workingDir: string
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
}

export type MarkdownEditorState = {
    name: string
    slug: string
    description: string
    tags: string[]
    content: string
}

export type SavedDraftAttachPlan =
    | {
        kind: 'instruction'
        agentId: string
        draftId: string
    }
    | {
        kind: 'skill-add'
        agentId: string
        draftId: string
    }
    | {
        kind: 'skill-replace'
        agentId: string
        draftId: string
        targetRef: NonNullable<WorkspaceMarkdownEditorAttachTarget['targetRef']>
    }

export function buildMarkdownEditorState(draft: DraftPrimitive | undefined): MarkdownEditorState {
    const name = typeof draft?.name === 'string' ? draft.name : ''
    return {
        name,
        slug: typeof draft?.slug === 'string' && draft.slug.trim() ? draft.slug : nameToSlug(name),
        description: typeof draft?.description === 'string' ? draft.description : '',
        tags: Array.isArray(draft?.tags) ? draft.tags : [],
        content: typeof draft?.content === 'string' ? draft.content : '',
    }
}

export function isMarkdownEditorDirty(
    baseline: WorkspaceMarkdownEditorNode['baseline'] | null | undefined,
    state: MarkdownEditorState,
) {
    if (!baseline) return true
    return baseline.name !== state.name
        || (baseline.slug || '') !== state.slug
        || (baseline.description || '') !== state.description
        || !equalStringArray(baseline.tags || [], state.tags)
        || baseline.content !== state.content
}

export function buildMarkdownDraftUpdate(draft: DraftPrimitive, state: MarkdownEditorState, updatedAt: number): DraftPrimitive {
    return {
        ...draft,
        name: state.name,
        slug: state.slug,
        description: state.description,
        tags: state.tags,
        content: state.content,
        updatedAt,
    }
}

export function buildSavedDraftAttachPlan(
    attachTarget: WorkspaceMarkdownEditorAttachTarget | null | undefined,
    draftId: string,
): SavedDraftAttachPlan | null {
    if (!attachTarget?.agentId) return null
    if (attachTarget.mode === 'instruction') {
        return {
            kind: 'instruction',
            agentId: attachTarget.agentId,
            draftId,
        }
    }
    if (attachTarget.mode === 'skill-new' && !attachTarget.targetRef) {
        return {
            kind: 'skill-add',
            agentId: attachTarget.agentId,
            draftId,
        }
    }
    if (!attachTarget.targetRef) return null
    return {
        kind: 'skill-replace',
        agentId: attachTarget.agentId,
        draftId,
        targetRef: attachTarget.targetRef,
    }
}
