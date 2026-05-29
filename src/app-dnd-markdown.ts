import { useStudioStore } from './store'
import type { StudioState } from './store/types'
import type { DragPrimitive, DropTargetData } from './lib/dnd-handlers'
import { showToast } from './lib/toast'

export async function loadMarkdownTemplateIntoEditor(
    editorId: string,
    primitive: DragPrimitive,
    store: StudioState,
) {
    const editor = store.markdownEditors.find((item) => item.id === editorId)
    if (!editor) {
        throw new Error('Editor not found.')
    }
    if (editor.kind !== primitive.kind) {
        throw new Error(`${editor.kind === 'instruction' ? 'Instruction' : 'Skill'} editor only accepts matching primitives.`)
    }

    const currentDraft = store.drafts[editor.draftId]
    if (!currentDraft) {
        throw new Error('Editor draft not found.')
    }
    if (primitive.source !== 'draft') {
        throw new Error('Only Studio draft templates can be dropped into markdown editors. Import external sources as APM packages first.')
    }
    const sourceDraft = typeof primitive.draftId === 'string' ? store.drafts[primitive.draftId] : null
    const sourceContent = typeof sourceDraft?.content === 'string'
        ? sourceDraft.content
        : typeof primitive.content === 'string'
            ? primitive.content
            : ''
    const sourceTags = Array.isArray(sourceDraft?.tags)
        ? sourceDraft.tags
        : Array.isArray(primitive.tags)
            ? primitive.tags
            : currentDraft.tags

    store.upsertDraft({
        ...currentDraft,
        name: sourceDraft?.name || primitive.name || currentDraft.name,
        slug: sourceDraft?.slug || primitive.slug || primitive.name || currentDraft.slug,
        description: sourceDraft?.description || primitive.description || primitive.name || currentDraft.description,
        tags: sourceTags,
        content: sourceContent,
        derivedFrom: sourceDraft?.derivedFrom || primitive.urn || currentDraft.derivedFrom,
        updatedAt: Date.now(),
    })
    store.updateMarkdownEditorBaseline(editor.id, {
        name: sourceDraft?.name || primitive.name || currentDraft.name,
        slug: sourceDraft?.slug || primitive.slug || primitive.name || currentDraft.slug,
        description: sourceDraft?.description || primitive.description || primitive.name || currentDraft.description,
        tags: sourceTags,
        content: sourceContent,
    })
    store.selectMarkdownEditor(editor.id)
    showToast(`Loaded ${primitive.kind} template into the editor.`, 'success')
}

export async function handleMarkdownEditorDrop(
    dropData: DropTargetData,
    primitive: DragPrimitive,
    store: StudioState,
) {
    if (dropData.type !== 'markdown-editor' || (primitive.kind !== 'instruction' && primitive.kind !== 'skill') || !dropData.editorId) {
        return false
    }

    try {
        await loadMarkdownTemplateIntoEditor(dropData.editorId, primitive, store)
    } catch (error) {
        console.error('Failed to load markdown template', error)
        showToast('Failed to load primitive template into the editor.', 'error', {
            title: 'Template import failed',
            dedupeKey: `markdown-template-import:${dropData.editorId}:${primitive.kind}:${primitive.slug || primitive.name}`,
            actionLabel: 'Retry',
            onAction: () => {
                void loadMarkdownTemplateIntoEditor(dropData.editorId as string, primitive, useStudioStore.getState()).catch((retryError) => {
                    console.error('Failed to retry markdown template load', retryError)
                })
            },
        })
    }
    return true
}
