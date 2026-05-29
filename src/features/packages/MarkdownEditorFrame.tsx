import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { useStudioStore } from '../../store'
import { draftApi } from '../../api-clients/drafts'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { equalStringArray, markdownEditorModeConfig, nameToSlug } from './markdown-authoring'
import MarkdownPrimitiveEditor, { MarkdownEditorMissing } from './MarkdownPrimitiveEditor'
import {
    buildMarkdownDraftUpdate,
    buildMarkdownEditorState,
    buildSavedDraftAttachPlan,
    isMarkdownEditorDirty,
    type MarkdownEditorFrameData,
} from './markdown-editor-state'

export default function MarkdownEditorFrame({ id, data, selected }: NodeProps<Node<MarkdownEditorFrameData, 'markdownEditor'>>) {
    const draft = useStudioStore((state) => state.drafts[data.draftId])
    const upsertDraft = useStudioStore((state) => state.upsertDraft)
    const saveMarkdownDraft = useStudioStore((state) => state.saveMarkdownDraft)
    const removeMarkdownEditor = useStudioStore((state) => state.removeMarkdownEditor)
    const setAgentInstructionRef = useStudioStore((state) => state.setAgentInstructionRef)
    const addAgentSkillRef = useStudioStore((state) => state.addAgentSkillRef)
    const replaceAgentSkillRef = useStudioStore((state) => state.replaceAgentSkillRef)

    const [status, setStatus] = useState<null | { tone: 'success' | 'error'; message: string }>(null)
    const [busyAction, setBusyAction] = useState<null | 'save'>(null)
    const config = markdownEditorModeConfig(data.kind)
    const [editorState, setEditorState] = useState(() => buildMarkdownEditorState(draft))

    useEffect(() => {
        const currentDraft = data.draftId ? useStudioStore.getState().drafts[data.draftId] : undefined
        setEditorState(buildMarkdownEditorState(currentDraft))
    }, [data.draftId, draft?.id])

    const saveState = draft?.saveState || 'unsaved'
    const deferredPreviewContent = useDeferredValue(editorState.content)
    const dirty = useMemo(
        () => isMarkdownEditorDirty(data.baseline || null, editorState),
        [data.baseline, editorState],
    )

    const applySavedDraftRef = (draftId: string) => {
        const plan = buildSavedDraftAttachPlan(data.attachTarget, draftId)
        if (!plan) return
        const nextRef = { kind: 'draft' as const, draftId }
        if (plan.kind === 'instruction') {
            setAgentInstructionRef(plan.agentId, nextRef)
            return
        }
        if (plan.kind === 'skill-add') {
            addAgentSkillRef(plan.agentId, nextRef)
            return
        }
        replaceAgentSkillRef(plan.agentId, plan.targetRef, nextRef)
    }

    const flushEditorStateToDraft = useCallback(() => {
        if (!draft) return
        upsertDraft(buildMarkdownDraftUpdate(draft, editorState, Date.now()))
    }, [draft, editorState, upsertDraft])

    useEffect(() => {
        if (!draft) return
        const draftState = buildMarkdownEditorState(draft)
        if (
            draftState.name === editorState.name
            && draftState.slug === editorState.slug
            && draftState.description === editorState.description
            && equalStringArray(draftState.tags, editorState.tags)
            && draftState.content === editorState.content
        ) {
            return
        }

        const timeoutId = window.setTimeout(() => {
            flushEditorStateToDraft()
        }, 180)

        return () => window.clearTimeout(timeoutId)
    }, [draft, editorState, flushEditorStateToDraft])

    const handleSaveDraft = async () => {
        if (!draft) return
        try {
            setBusyAction('save')
            setStatus(null)
            flushEditorStateToDraft()
            const saved = await saveMarkdownDraft(id)
            applySavedDraftRef(saved.id)
            setStatus({
                tone: 'success',
                message: draft.saveState === 'saved'
                    ? 'Draft updated.'
                    : 'Draft saved.',
            })
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }

    const handleOpenSkillBundle = async () => {
        try {
            if (!draft || draft.kind !== 'skill' || draft.saveState !== 'saved') return
            await draftApi.skillBundle.openFolder(draft.id)
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        }
    }

    const handleCloseEditor = () => {
        flushEditorStateToDraft()
        removeMarkdownEditor(id)
    }

    if (!draft) {
        return <MarkdownEditorMissing onClose={() => removeMarkdownEditor(id)} />
    }

    return (
        <MarkdownPrimitiveEditor
            title={config.title}
            dirty={dirty}
            saveLabel="Save Draft"
            showOpenButton={config.showOpenButton}
            name={editorState.name}
            description={editorState.description}
            tags={editorState.tags}
            content={editorState.content}
            previewContent={deferredPreviewContent}
            helpText={config.helpText}
            placeholder={config.placeholder}
            saveState={saveState}
            status={status}
            busyLabel={busyAction === 'save' ? 'Saving draft...' : null}
            selected={!!selected}
            width={Number(data.width || 560)}
            height={Number(data.height || 380)}
            transformActive={!!data.transformActive}
            onActivateTransform={data.onActivateTransform}
            onDeactivateTransform={data.onDeactivateTransform}
            onNameChange={(value) => setEditorState((state) => ({ ...state, name: value, slug: nameToSlug(value) }))}
            onDescriptionChange={(value) => setEditorState((state) => ({ ...state, description: value }))}
            onTagsChange={(tags) => setEditorState((state) => ({ ...state, tags }))}
            onContentChange={(value) => setEditorState((state) => ({ ...state, content: value }))}
            onSaveDraft={() => { void handleSaveDraft() }}
            onOpen={data.kind === 'skill' ? () => { void handleOpenSkillBundle() } : undefined}
            onClose={handleCloseEditor}
        />
    )
}
