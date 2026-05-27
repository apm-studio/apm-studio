import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStudioStore } from '../../store'
import { api } from '../../api'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import {
    buildActAssetPayload,
    buildPerformerAssetPayload,
} from '../../lib/performers'
import { queryKeys, useAssetKind } from '../../hooks/queries'
import { useApmLogin } from '../../hooks/useApmLogin'
import {
    buildMarkdownAssetPayload,
    buildPublishFormSeed,
    buildPerformerPreflight,
    buildPickerItems,
    getActPublishBlockReasons,
    parseTags,
} from './publish-modal-utils'
import type { PickerItem } from './publish-modal-utils'
import { stageFromWorkingDir } from '../../../shared/publish-stage'

export function usePublishModalController(open: boolean) {
    const workingDir = useStudioStore((state) => state.workingDir)
    const performers = useStudioStore((state) => state.performers)
    const drafts = useStudioStore((state) => state.drafts)
    const markdownEditors = useStudioStore((state) => state.markdownEditors)
    const acts = useStudioStore((state) => state.acts)

    const updatePerformerAuthoringMeta = useStudioStore((state) => state.updatePerformerAuthoringMeta)
    const updateActAuthoringMeta = useStudioStore((state) => state.updateActAuthoringMeta)
    const updateMarkdownEditorBaseline = useStudioStore((state) => state.updateMarkdownEditorBaseline)
    const upsertDraft = useStudioStore((state) => state.upsertDraft)
    const setPerformerTalRef = useStudioStore((state) => state.setPerformerTalRef)
    const addPerformerDanceRef = useStudioStore((state) => state.addPerformerDanceRef)
    const replacePerformerDanceRef = useStudioStore((state) => state.replacePerformerDanceRef)

    const queryClient = useQueryClient()
    const { authUser, startLogin, isAuthenticating } = useApmLogin()
    const { data: installedTals = [] } = useAssetKind('tal', open)

    const [step, setStep] = useState<'picker' | 'form'>('picker')
    const [pickerSelection, setPickerSelection] = useState<PickerItem | null>(null)
    const [slug, setSlug] = useState('')
    const [stage, setStage] = useState('')
    const [description, setDescription] = useState('')
    const [tagsText, setTagsText] = useState('')
    const [status, setStatus] = useState<null | { tone: 'success' | 'error'; message: string }>(null)
    const [action, setAction] = useState<null | 'save-local'>(null)
    const performer = pickerSelection?.kind === 'performer'
        ? performers.find((p) => p.id === pickerSelection.performerId) || null
        : null
    const markdownEditor = pickerSelection?.source === 'draft'
        ? markdownEditors.find((e) => e.id === pickerSelection.editorId) || null
        : null
    const draft = markdownEditor ? drafts[markdownEditor.draftId] || null : null
    const isLocalAsset = pickerSelection?.source === 'local'
    const selectedAct = pickerSelection?.kind === 'act'
        ? acts.find((a) => a.id === pickerSelection.actId) || null
        : null

    const target = performer
        ? { kind: 'performer' as const, id: performer.id, name: performer.name }
        : selectedAct
            ? { kind: 'act' as const, id: selectedAct.id, name: selectedAct.name }
            : markdownEditor && draft && markdownEditor.kind === 'tal'
                ? { kind: markdownEditor.kind, id: markdownEditor.id, name: draft.name || `${markdownEditor.kind} draft` }
                : isLocalAsset && pickerSelection
                    ? { kind: pickerSelection.kind, id: pickerSelection.urn, name: pickerSelection.name }
                    : null

    const pickerItems = useMemo(() => buildPickerItems({
        installedTals,
        markdownEditors,
        drafts,
        performers,
        acts,
    }), [acts, drafts, installedTals, markdownEditors, performers])

    useEffect(() => {
        if (open) {
            setStep('picker')
            setPickerSelection(null)
            setStatus(null)
        }
    }, [open])

    useEffect(() => {
        if (step !== 'form' || !pickerSelection) return
        setStatus(null)

        const formSeed = buildPublishFormSeed({
            performer,
            draft,
            act: selectedAct,
            localItem: isLocalAsset && pickerSelection.source === 'local' ? pickerSelection : null,
        })
        if (!formSeed) return

        setSlug(formSeed.slug)
        setStage(formSeed.stage || stageFromWorkingDir(workingDir))
        setDescription(formSeed.description)
        setTagsText(formSeed.tagsText)
    }, [draft, isLocalAsset, performer, pickerSelection, selectedAct, step, workingDir])

    const performerPreflight = useMemo(() => buildPerformerPreflight(performer), [performer])

    const markdownDirty = useMemo(() => {
        if (!markdownEditor || !draft) return false
        const baseline = markdownEditor.baseline
        if (!baseline) return true
        return baseline.name !== draft.name
            || (baseline.slug || '') !== (draft.slug || '')
            || (baseline.description || '') !== (draft.description || '')
            || JSON.stringify(baseline.tags || []) !== JSON.stringify(draft.tags || [])
            || baseline.content !== draft.content
    }, [draft, markdownEditor])

    const canSaveLocal = !!target
        && !!stage.trim()
        && !!slug.trim()
        && (!markdownEditor || markdownDirty)
        && !!authUser?.authenticated
        && (!performer || performerPreflight.every((entry) => entry.status === 'ready'))
        && (!selectedAct || getActPublishBlockReasons(selectedAct).length === 0)

    const invalidateKind = async (kind: 'tal' | 'dance' | 'performer' | 'act') => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetKind(workingDir, kind) }),
        ])
    }

    const syncMarkdownDraftLocalState = (
        resultUrn: string,
        nextSlug: string,
        payload: ReturnType<typeof buildMarkdownAssetPayload>,
    ) => {
        if (!markdownEditor || !draft) return

        upsertDraft({
            ...draft,
            slug: nextSlug,
            description: payload.description,
            tags: payload.tags,
            derivedFrom: resultUrn,
            updatedAt: Date.now(),
        })
        updateMarkdownEditorBaseline(markdownEditor.id, {
            name: draft.name,
            slug: nextSlug,
            description: payload.description,
            tags: payload.tags,
            content: payload.content,
        })

        if (!markdownEditor.attachTarget?.performerId) return

        const nextRef = { kind: 'registry' as const, urn: resultUrn }
        if (markdownEditor.attachTarget.mode === 'tal') {
            setPerformerTalRef(markdownEditor.attachTarget.performerId, nextRef)
        } else if (markdownEditor.attachTarget.mode === 'dance-new' && !markdownEditor.attachTarget.targetRef) {
            addPerformerDanceRef(markdownEditor.attachTarget.performerId, nextRef)
        } else if (markdownEditor.attachTarget.targetRef) {
            replacePerformerDanceRef(markdownEditor.attachTarget.performerId, markdownEditor.attachTarget.targetRef, nextRef)
        }
    }

    const syncActAuthoringMeta = (actId: string, tags: string[]) => {
        const act = acts.find((entry) => entry.id === actId)
        if (!act) return

        updateActAuthoringMeta(actId, {
            ...act.meta,
            authoring: {
                ...(act.meta?.authoring || {}),
                slug,
                description,
                tags,
            },
        })
    }

    const handleSaveLocal = async () => {
        if (!target) return
        try {
            setAction('save-local')
            setStatus(null)
            const tags = parseTags(tagsText)

            if (target.kind === 'performer' && performer) {
                updatePerformerAuthoringMeta(performer.id, { slug, description, tags })
                const payload = buildPerformerAssetPayload(performer, {
                    name: performer.name,
                    description,
                    tags,
                })
                const result = await api.apmAssets.saveLocalAsset('performer', slug, payload, authUser?.username || undefined, stage)
                await invalidateKind('performer')
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local agent asset at ${result.urn}.` : `Saved local agent asset at ${result.urn}.`,
                })
                return
            }

            if (target.kind === 'act' && selectedAct) {
                syncActAuthoringMeta(selectedAct.id, tags)
                const payload = buildActAssetPayload(selectedAct, { description, tags })
                const result = await api.apmAssets.saveLocalAsset('act', slug, payload, authUser?.username || undefined, stage)
                await invalidateKind('act')
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local team asset at ${result.urn}.` : `Saved local team asset at ${result.urn}.`,
                })
                return
            }

            if (target.kind === 'tal' && markdownEditor && draft) {
                const payload = buildMarkdownAssetPayload(markdownEditor, draft, slug, description, tags)
                const result = await api.apmAssets.saveLocalAsset(markdownEditor.kind, slug, payload, authUser?.username || undefined, stage)
                syncMarkdownDraftLocalState(result.urn, slug, payload)
                await invalidateKind(markdownEditor.kind)
                setStatus({
                    tone: 'success',
                    message: result.existed ? `Updated local ${markdownEditor.kind} asset at ${result.urn}.` : `Saved local ${markdownEditor.kind} asset at ${result.urn}.`,
                })
                return
            }

            if (target.kind === 'tal' && isLocalAsset) {
                setStatus({ tone: 'success', message: `${target.kind}/${target.id} is already saved locally.` })
            }
        } catch (error: unknown) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setAction(null)
        }
    }

    return {
        authUser,
        isAuthenticating,
        startLogin,
        step,
        setStep,
        pickerSelection,
        setPickerSelection,
        target,
        slug,
        setSlug,
        stage,
        setStage,
        description,
        setDescription,
        tagsText,
        setTagsText,
        status,
        action,
        pickerItems,
        performerPreflight,
        markdownEditor,
        markdownDirty,
        draft,
        canSaveLocal,
        isLocalAsset,
        handleSaveLocal,
        handlePickItem: (item: PickerItem) => {
            setPickerSelection(item)
            setStep('form')
        },
        handleBack: () => {
            setStep('picker')
            setPickerSelection(null)
            setStatus(null)
        },
    }
}
