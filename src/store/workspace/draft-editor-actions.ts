import type { WorkspaceMarkdownEditorNode } from '../../../shared/workspace-contracts'
import { mapMarkdownEditors } from './helpers'
import type { WorkspaceGetState, WorkspaceSetState } from './action-context'
import {
    addAgentFromDraftImpl,
    importTeamFromDraftImpl,
} from './draft-import-actions'
import {
    loadDraftsFromDiskImpl,
    saveAgentAsDraftImpl,
    saveMarkdownDraftImpl,
    saveTeamAsDraftImpl,
    upsertDraftImpl,
} from './draft-persistence-actions'
import { scheduleDraftPersist } from './draft-persist-scheduler'
import {
    createMarkdownEditorImpl,
    openDraftEditorImpl,
} from './markdown-editor-actions'
import {
    agentIdCounter,
    makeWorkspaceNodeId,
    markdownEditorIdCounter,
} from './id-state'
import type { WorkspaceSlice } from './types'

type WorkspaceDraftEditorActions = Pick<WorkspaceSlice,
    | 'upsertDraft'
    | 'saveAgentAsDraft'
    | 'saveTeamAsDraft'
    | 'loadDraftsFromDisk'
    | 'addAgentFromDraft'
    | 'importTeamFromDraft'
    | 'createMarkdownEditor'
    | 'saveMarkdownDraft'
    | 'updateMarkdownEditorPosition'
    | 'updateMarkdownEditorSize'
    | 'updateMarkdownEditorBaseline'
    | 'removeMarkdownEditor'
    | 'openDraftEditor'
>

export function createWorkspaceDraftEditorActions(set: WorkspaceSetState, get: WorkspaceGetState): WorkspaceDraftEditorActions {
    return {
        upsertDraft: (draft) => {
            upsertDraftImpl(get, set, scheduleDraftPersist, draft)
        },

        saveAgentAsDraft: async (agentId) => saveAgentAsDraftImpl(get, set, agentId),

        loadDraftsFromDisk: async () => loadDraftsFromDiskImpl(set),

        saveTeamAsDraft: async (teamId) => saveTeamAsDraftImpl(get, set, teamId),

        addAgentFromDraft: (name, draftContent, description) => addAgentFromDraftImpl(get, set, agentIdCounter, name, draftContent, description),

        importTeamFromDraft: (name, draftContent) => importTeamFromDraftImpl(get, set, makeWorkspaceNodeId, name, draftContent),

        createMarkdownEditor: (kind, options) => createMarkdownEditorImpl(get, set, markdownEditorIdCounter, makeWorkspaceNodeId, kind, options),

        openDraftEditor: (draftId) => openDraftEditorImpl(get, set, markdownEditorIdCounter, draftId),

        saveMarkdownDraft: async (editorId) => saveMarkdownDraftImpl(get, set, editorId),

        updateMarkdownEditorPosition: (id, x, y) => set((s) => ({
            markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, position: { x, y } })),
            workspaceDirty: true,
        })),

        updateMarkdownEditorSize: (id, width, height) => set((s) => ({
            markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, width, height })),
            workspaceDirty: true,
        })),

        updateMarkdownEditorBaseline: (id, baseline: WorkspaceMarkdownEditorNode['baseline']) => set((s) => ({
            markdownEditors: mapMarkdownEditors(s.markdownEditors, id, (editor) => ({ ...editor, baseline })),
            workspaceDirty: true,
        })),

        removeMarkdownEditor: (id) => set((s) => ({
            markdownEditors: s.markdownEditors.filter((editor) => editor.id !== id),
            selectedMarkdownEditorId: s.selectedMarkdownEditorId === id ? null : s.selectedMarkdownEditorId,
            workspaceDirty: true,
        })),
    }
}
