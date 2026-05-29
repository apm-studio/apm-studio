import {
    resolveFocusTarget,
} from '../../lib/focus-utils'
import {
    buildEnterFocusModeState,
    buildExitFocusModeState,
    resolveCurrentFocusViewportSize,
} from './focus-mode-state'
import {
    resolveCanvasResetSplitView,
} from './split-view-layout'
import type {
    WorkspaceGetState,
    WorkspaceSetState,
} from './action-context'
import type {
    FullscreenNodeType,
} from './types'
import type { StudioState } from '../types'

type FocusNodeType = FullscreenNodeType
type ViewportSize = { width: number; height: number }

export function enterFocusModeImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    nodeId: string,
    nodeType: FocusNodeType,
    viewportSize: ViewportSize,
) {
    const state = get()
    if (state.focusSnapshot) {
        // Prevent corrupting the root snapshot if accidentally called again.
        return
    }
    const patch = buildEnterFocusModeState(state, { id: nodeId, type: nodeType }, viewportSize)
    if (patch) {
        set(patch)
    }
}

export function enterEmptyFullViewImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
) {
    const state = get()
    if (state.viewMode === 'full' && !state.focusSnapshot) {
        return
    }
    const restoredState = state.focusSnapshot
        ? buildExitFocusModeState(state) || {}
        : {}
    const restoredSplitView = resolveCanvasResetSplitView({ ...state, ...restoredState } as StudioState)

    set({
        ...restoredState,
        viewMode: 'full',
        splitView: restoredSplitView,
        focusSnapshot: null,
        selectedAgentId: null,
        selectedTeamId: null,
        editingTarget: null,
        inspectorFocus: null,
    })
}

export function exitFocusModeImpl(get: WorkspaceGetState, set: WorkspaceSetState) {
    const state = get()
    const patch = buildExitFocusModeState(state)
    if (!patch) return
    set(patch)
}

export function switchFocusTargetImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    nodeId: string,
    nodeType: FocusNodeType,
) {
    const state = get()
    const currentTarget = resolveFocusTarget(state.focusSnapshot)
    if (!currentTarget) return

    if (nodeId === currentTarget.id && nodeType === currentTarget.type) return

    const restoredPatch = buildExitFocusModeState(state)
    if (!restoredPatch) {
        return
    }

    const restoredState = { ...state, ...restoredPatch } as StudioState
    const viewportSize = resolveCurrentFocusViewportSize(state, currentTarget)
    const nextPatch = buildEnterFocusModeState(restoredState, { id: nodeId, type: nodeType }, viewportSize)
    if (nextPatch) {
        set(nextPatch)
    }
}
