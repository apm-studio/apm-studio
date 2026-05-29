import type { AssistantDraftBlueprint } from '../../../shared/assistant-actions'
import { normalizeAssistantBundlePath } from '../../../shared/assistant-bundle-path'
import { useStudioStore } from '../../store'
import { draftApi } from '../../api-clients/drafts'
import { store, type AssistantRefState } from './assistant-action-state'
import { resolveSavedDraftId } from './assistant-action-resolvers'

export async function createDraft(
    kind: 'instruction' | 'skill',
    blueprint: AssistantDraftBlueprint,
    refs: AssistantRefState,
): Promise<string> {
    const draft = await draftApi.create({
        kind,
        name: blueprint.name,
        content: blueprint.content,
        ...(blueprint.slug ? { slug: blueprint.slug } : {}),
        ...(blueprint.description ? { description: blueprint.description } : {}),
        ...(blueprint.tags ? { tags: blueprint.tags } : {}),
    })
    useStudioStore.setState((state) => ({
        drafts: {
            ...state.drafts,
            [draft.id]: {
                ...draft,
                saveState: 'saved',
            },
        },
        workspaceDirty: true,
    }))
    store().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })
    if (blueprint.ref) {
        refs.drafts.set(blueprint.ref, { kind, id: draft.id })
    }
    if (blueprint.openEditor) {
        store().openDraftEditor(draft.id)
    }
    return draft.id
}

export async function resolveSkillBundleTarget(
    refs: AssistantRefState,
    options: { draftId?: string; draftRef?: string; draftName?: string; path: string },
): Promise<{ draftId: string; path: string } | null> {
    const draftId = resolveSavedDraftId(refs, 'skill', options)
    if (!draftId) return null

    const normalizedPath = normalizeAssistantBundlePath(options.path)
    if (!normalizedPath) return null

    return { draftId, path: normalizedPath }
}
