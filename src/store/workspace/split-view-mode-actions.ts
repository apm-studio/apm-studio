import {
    createEmptySplitViewState,
    createSplitViewPane,
    DEFAULT_SPLIT_VIEW_COLUMNS,
    getCanvasViewportSize,
    resolveFocusTarget,
} from '../../lib/focus-utils'
import {
    buildSplitViewLayoutState,
    normalizeSplitViewState,
    resolveSelectedFullscreenTarget,
    resolveSplitViewTarget,
    sanitizeSplitViewPanes,
    splitRowsFromPanes,
    targetExists,
} from './split-view-layout'
import {
    buildExitFocusModeState,
    buildFocusSnapshot,
} from './focus-mode-state'
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

export function enterEmptySplitViewImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
) {
    const state = get()
    if (state.viewMode === 'split' && state.splitView.panes.length === 0 && !state.focusSnapshot) {
        return
    }
    const restoredState = state.focusSnapshot
        ? buildExitFocusModeState(state) || {}
        : {}

    set({
        ...restoredState,
        viewMode: 'split',
        splitView: createEmptySplitViewState(),
        focusSnapshot: null,
        selectedAgentId: null,
        selectedTeamId: null,
        editingTarget: null,
        inspectorFocus: null,
    })
}

export function enterSplitViewImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    nodeId?: string,
    nodeType?: FocusNodeType,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    const requestedTarget = nodeId && nodeType ? { id: nodeId, type: nodeType } : null
    const reusablePanes = sanitizeSplitViewPanes(state, state.splitView.panes)
    const shouldRestoreSavedSplitView = !requestedTarget && reusablePanes.length > 0
    const initialTarget = requestedTarget
        || resolveFocusTarget(state.focusSnapshot)
        || (shouldRestoreSavedSplitView ? resolveSplitViewTarget(state) : null)
        || resolveSelectedFullscreenTarget(state)

    if (!initialTarget || !targetExists(state, initialTarget)) {
        return
    }

    const snapshot = state.focusSnapshot || buildFocusSnapshot(state, initialTarget)
    if (!snapshot) {
        return
    }

    const shouldReuseSplitView = reusablePanes.length > 0 && (state.viewMode === 'split' || shouldRestoreSavedSplitView)
    const currentPanes = shouldReuseSplitView
        ? reusablePanes
        : [createSplitViewPane(initialTarget.id, initialTarget.type)]
    const activePaneId = shouldReuseSplitView && currentPanes.some((pane) => pane.paneId === state.splitView.activePaneId)
        ? state.splitView.activePaneId
        : currentPanes[0]?.paneId || null
    const splitView = normalizeSplitViewState({ ...state, focusSnapshot: snapshot } as StudioState, {
        panes: currentPanes,
        activePaneId,
        rows: shouldReuseSplitView
            ? splitRowsFromPanes(currentPanes, state.splitView.rows || state.splitView.columns)
            : [[currentPanes[0].paneId]],
        rowWeights: shouldReuseSplitView ? state.splitView.rowWeights : undefined,
        columnWeights: shouldReuseSplitView ? state.splitView.columnWeights : undefined,
        columns: state.splitView?.columns ?? DEFAULT_SPLIT_VIEW_COLUMNS,
    })

    set({
        focusSnapshot: snapshot,
        ...buildSplitViewLayoutState({ ...state, focusSnapshot: snapshot } as StudioState, splitView, viewportSize),
    })
}
