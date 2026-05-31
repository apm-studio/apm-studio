import { studioApi } from '../../api-clients/studio'
import type { WorkspaceSetState } from './action-context'
import { buildExitFocusModeState } from './focus-mode-state'
import type { WorkspaceSlice } from './types'

type WorkspaceShellActions = Pick<WorkspaceSlice,
    | 'setTerminalOpen'
    | 'setTrackingOpen'
    | 'setWorkspaceMode'
    | 'setPackageLibraryOpen'
    | 'toggleTheme'
    | 'setCanvasCenter'
    | 'exitTeamLayoutMode'
    | 'selectMarkdownEditor'
    | 'revealCanvasNode'
    | 'setInspectorFocus'
    | 'openAgentEditor'
    | 'closeEditor'
>

export function createWorkspaceShellActions(set: WorkspaceSetState): WorkspaceShellActions {
    return {
        setTerminalOpen: (open) => set({ isTerminalOpen: open }),

        setTrackingOpen: (open) => set(open
            ? { isTrackingOpen: true, isAssistantOpen: false }
            : { isTrackingOpen: false }),

        setWorkspaceMode: (mode) => set(() => {
            if (mode === 'import' || mode === 'manage') {
                return {
                    workspaceMode: mode,
                    isTrackingOpen: false,
                    isAssistantOpen: false,
                    isTerminalOpen: false,
                    isPackageLibraryOpen: false,
                }
            }

            return { workspaceMode: mode }
        }),

        setPackageLibraryOpen: (open) => set({ isPackageLibraryOpen: open }),

        toggleTheme: () => set((s) => {
            const newTheme = s.theme === 'light' ? 'dark' : 'light'
            localStorage.setItem('apm-theme', newTheme)
            studioApi.updateConfig({ theme: newTheme }).catch(err => console.warn('[studio] theme sync failed', err))
            return { theme: newTheme }
        }),

        setCanvasCenter: (x, y) => set({ canvasCenter: { x, y } }),

        exitTeamLayoutMode: () => set({ layoutTeamId: null }),

        selectMarkdownEditor: (id) => set((s) => ({
            ...((id && s.focusSnapshot) ? (buildExitFocusModeState(s) || {}) : {}),
            selectedMarkdownEditorId: id,
            selectedAgentId: null,
            selectedAgentSessionId: null,
            selectedTeamId: id ? null : s.selectedTeamId,
            teamEditorState: id ? null : s.teamEditorState,
            inspectorFocus: null,
        })),

        revealCanvasNode: (nodeId, nodeType) => set((state) => ({
            canvasRevealTarget: {
                id: nodeId,
                type: nodeType,
                nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
            },
        })),

        setInspectorFocus: (focus) => set({ inspectorFocus: focus }),

        openAgentEditor: (id, focus = null) => set({
            editingTarget: { type: 'agent', id },
            selectedAgentId: id,
            selectedAgentSessionId: null,
            selectedMarkdownEditorId: null,
            selectedTeamId: null,
            teamEditorState: null,
            inspectorFocus: focus,
        }),

        closeEditor: () => set({
            editingTarget: null,
            inspectorFocus: null,
        }),
    }
}
