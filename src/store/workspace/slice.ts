import type { StateCreator } from 'zustand'
import { createEmptyProjectionDirtyState } from '../runtime/change-policy'
import type { StudioState } from '../types'
import { createWorkspaceAgentActions } from './agent-actions'
import { createWorkspaceDraftEditorActions } from './draft-editor-actions'
import { createWorkspaceFocusActions } from './focus-slice-actions'
import { buildCanvasViewResetState } from './focus-mode-state'
import { createWorkspaceProjectionActions } from './projection-actions'
import { createWorkspaceRuntimeActions } from './runtime-actions'
import { createWorkspaceShellActions } from './shell-actions'
import { createWorkspaceStorageActions } from './storage-actions'
import { createWorkspaceTerminalActions } from './terminal-actions'
import type { WorkspaceSlice } from './types'

export const createWorkspaceSlice: StateCreator<
    StudioState,
    [],
    [],
    WorkspaceSlice
> = (set, get) => ({
    workspaceId: null,
    agents: [],
    drafts: {},
    markdownEditors: [],
    editingTarget: null,
    selectedAgentId: null,
    selectedAgentSessionId: null,
    selectedMarkdownEditorId: null,
    workspaceMode: 'studio-agent',
    ...buildCanvasViewResetState(),
    canvasRevealTarget: null,
    inspectorFocus: null,
    workspaceList: [],
    workspaceDirty: false,
    projectionDirty: createEmptyProjectionDirtyState(),
    runtimeReloadPending: false,
    theme: (localStorage.getItem('apm-theme') as 'light' | 'dark') || 'light',
    workingDir: '',
    isTerminalOpen: false,
    isTrackingOpen: false,
    isPackageLibraryOpen: false,
    canvasTerminals: [],
    canvasCenter: null,
    layoutTeamId: null,
    teamEditorState: null,

    ...createWorkspaceShellActions(set),
    ...createWorkspaceProjectionActions(set, get),
    ...createWorkspaceAgentActions(set, get),
    ...createWorkspaceFocusActions(set, get),
    ...createWorkspaceStorageActions(set, get),
    ...createWorkspaceRuntimeActions(set, get),
    ...createWorkspaceTerminalActions(set, get),
    ...createWorkspaceDraftEditorActions(set, get),
})
