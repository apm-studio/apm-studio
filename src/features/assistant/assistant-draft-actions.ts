import type { AssistantAction } from '../../../shared/assistant-actions'
import { useStudioStore } from '../../store'
import { draftApi } from '../../api-clients/drafts'
import { buildDraftDeleteCascade } from '../../store/workspace/cascade-cleanup'
import { removeMarkdownEditorsByDraftIds } from '../../store/workspace/helpers'
import {
    createDraft,
    resolveSkillBundleTarget,
} from './assistant-action-draft-context'
import { resolveSavedDraftId } from './assistant-action-resolvers'
import {
    store,
    type AssistantRefState,
} from './assistant-action-state'

export async function applyAssistantDraftAction(
    action: AssistantAction,
    refs: AssistantRefState,
): Promise<{ success: boolean } | null> {
    switch (action.type) {
        case 'createInstructionDraft': {
            await createDraft('instruction', action, refs)
            return { success: true }
        }
        case 'updateInstructionDraft': {
            const draftId = resolveSavedDraftId(refs, 'instruction', action)
            if (!draftId) return { success: false }
            const draft = await draftApi.update('instruction', draftId, {
                ...(action.name ? { name: action.name } : {}),
                ...(action.content ? { content: action.content } : {}),
                ...(action.description !== undefined ? { description: action.description } : {}),
                ...(action.tags ? { tags: action.tags } : {}),
            })
            useStudioStore.setState((state) => ({
                drafts: { ...state.drafts, [draft.id]: { ...draft, saveState: 'saved' } },
                workspaceDirty: true,
            }))
            store().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })
            return { success: true }
        }
        case 'deleteInstructionDraft': {
            const draftId = resolveSavedDraftId(refs, 'instruction', action)
            if (!draftId) return { success: false }
            await draftApi.delete('instruction', draftId)
            useStudioStore.setState((state) => {
                const drafts = { ...state.drafts }
                delete drafts[draftId]
                const cascade = buildDraftDeleteCascade('instruction', draftId, state.agents, state.teams)
                return {
                    drafts,
                    markdownEditors: removeMarkdownEditorsByDraftIds(state.markdownEditors, [draftId]),
                    ...cascade,
                    workspaceDirty: true,
                }
            })
            store().recordStudioChange({ kind: 'draft', draftIds: [draftId], workspaceWide: true })
            return { success: true }
        }
        case 'createSkillDraft': {
            await createDraft('skill', action, refs)
            return { success: true }
        }
        case 'updateSkillDraft': {
            const draftId = resolveSavedDraftId(refs, 'skill', action)
            if (!draftId) return { success: false }
            const draft = await draftApi.update('skill', draftId, {
                ...(action.name ? { name: action.name } : {}),
                ...(action.content ? { content: action.content } : {}),
                ...(action.description !== undefined ? { description: action.description } : {}),
                ...(action.tags ? { tags: action.tags } : {}),
            })
            useStudioStore.setState((state) => ({
                drafts: { ...state.drafts, [draft.id]: { ...draft, saveState: 'saved' } },
                workspaceDirty: true,
            }))
            store().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })
            return { success: true }
        }
        case 'deleteSkillDraft': {
            const draftId = resolveSavedDraftId(refs, 'skill', action)
            if (!draftId) return { success: false }
            await draftApi.delete('skill', draftId)
            useStudioStore.setState((state) => {
                const drafts = { ...state.drafts }
                delete drafts[draftId]
                const cascade = buildDraftDeleteCascade('skill', draftId, state.agents, state.teams)
                return {
                    drafts,
                    markdownEditors: removeMarkdownEditorsByDraftIds(state.markdownEditors, [draftId]),
                    ...cascade,
                    workspaceDirty: true,
                }
            })
            store().recordStudioChange({ kind: 'draft', draftIds: [draftId], workspaceWide: true })
            return { success: true }
        }
        case 'upsertSkillBundleFile': {
            const target = await resolveSkillBundleTarget(refs, action)
            if (!target) return { success: false }
            await draftApi.skillBundle.writeFile(target.draftId, target.path, action.content)
            return { success: true }
        }
        case 'deleteSkillBundleEntry': {
            const target = await resolveSkillBundleTarget(refs, action)
            if (!target) return { success: false }
            await draftApi.skillBundle.deleteFile(target.draftId, target.path)
            return { success: true }
        }
        default:
            return null
    }
}
