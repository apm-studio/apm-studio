import {
    createSplitViewPane,
    DEFAULT_SPLIT_VIEW_COLUMNS,
    getCanvasViewportSize,
    resolveFocusTarget,
    SPLIT_VIEW_MAX_PANES,
} from '../../lib/focus-utils'
import {
    buildSplitViewLayoutState,
    insertPaneAtIndex,
    insertPaneInRows,
    movePaneToIndex,
    normalizeSplitViewPlacement,
    normalizeSplitViewState,
    splitRowsFromPanes,
    targetExists,
} from './split-view-layout'
import {
    buildFocusSnapshot,
} from './focus-mode-state'
import type {
    WorkspaceGetState,
    WorkspaceSetState,
} from './action-context'
import type {
    FullscreenNodeType,
    SplitViewPlacement,
} from './types'
import type { StudioState } from '../types'

type FocusNodeType = FullscreenNodeType
type ViewportSize = { width: number; height: number }

export function addSplitViewPaneImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    nodeId: string,
    nodeType: FocusNodeType,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    insertSplitViewPaneImpl(get, set, nodeId, nodeType, Number.POSITIVE_INFINITY, viewportSize)
}

export function insertSplitViewPaneImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    nodeId: string,
    nodeType: FocusNodeType,
    placement: number | SplitViewPlacement,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    const target = { id: nodeId, type: nodeType }
    if (!targetExists(state, target)) {
        return
    }

    const seedTarget = resolveFocusTarget(state.focusSnapshot) || target
    const snapshot = state.focusSnapshot || buildFocusSnapshot(state, seedTarget)
    if (!snapshot) {
        return
    }

    const basePanes = state.viewMode === 'split'
        ? state.splitView.panes
        : (resolveFocusTarget(snapshot) ? [createSplitViewPane(seedTarget.id, seedTarget.type)] : [])
    const baseRows = splitRowsFromPanes(basePanes, state.viewMode === 'split' ? state.splitView.rows || state.splitView.columns : undefined)
    const nextPane = createSplitViewPane(nodeId, nodeType)
    const hasPane = basePanes.some((pane) => pane.paneId === nextPane.paneId)
    if (!hasPane && basePanes.length >= SPLIT_VIEW_MAX_PANES) {
        return
    }

    const normalizedPlacement = normalizeSplitViewPlacement(basePanes, baseRows, placement)
    const panes = hasPane
        ? movePaneToIndex(basePanes, nextPane.paneId, Number.POSITIVE_INFINITY)
        : insertPaneAtIndex(basePanes, nextPane, Number.POSITIVE_INFINITY)
    const rows = insertPaneInRows(baseRows, nextPane.paneId, normalizedPlacement)
    const splitView = normalizeSplitViewState({ ...state, focusSnapshot: snapshot } as StudioState, {
        panes,
        activePaneId: nextPane.paneId,
        rows,
        rowWeights: state.viewMode === 'split' ? state.splitView.rowWeights : undefined,
        columnWeights: state.viewMode === 'split' ? state.splitView.columnWeights : undefined,
        columns: state.splitView?.columns ?? DEFAULT_SPLIT_VIEW_COLUMNS,
    })

    set({
        focusSnapshot: snapshot,
        ...buildSplitViewLayoutState({ ...state, focusSnapshot: snapshot } as StudioState, splitView, viewportSize),
    })
}

export function removeSplitViewPaneImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    paneId: string,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const panes = state.splitView.panes.filter((pane) => pane.paneId !== paneId)
    const rows = splitRowsFromPanes(panes, state.splitView.rows || state.splitView.columns)
    const splitView = normalizeSplitViewState(state, {
        panes,
        activePaneId: state.splitView.activePaneId === paneId ? panes[0]?.paneId || null : state.splitView.activePaneId,
        rows,
        rowWeights: state.splitView.rowWeights,
        columnWeights: state.splitView.columnWeights,
        columns: state.splitView.columns,
    })

    set(buildSplitViewLayoutState(state, splitView, viewportSize))
}

export function replaceSplitViewPaneImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    paneId: string,
    nodeId: string,
    nodeType: FocusNodeType,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    const target = { id: nodeId, type: nodeType }
    if (state.viewMode !== 'split' || !targetExists(state, target)) {
        return
    }

    const currentPane = state.splitView.panes.find((pane) => pane.paneId === paneId)
    if (!currentPane) {
        return
    }

    const nextPane = createSplitViewPane(nodeId, nodeType)
    const duplicatePane = state.splitView.panes.find((pane) => pane.paneId === nextPane.paneId)
    if (duplicatePane) {
        const targetIndex = state.splitView.panes.findIndex((pane) => pane.paneId === paneId)
        moveSplitViewPaneImpl(get, set, duplicatePane.paneId, targetIndex, viewportSize)
        return
    }

    const snapshot = state.focusSnapshot || buildFocusSnapshot(state, target)
    if (!snapshot) {
        return
    }

    const panes = state.splitView.panes.map((pane) => (
        pane.paneId === paneId ? nextPane : pane
    ))
    const rows = splitRowsFromPanes(state.splitView.panes, state.splitView.rows || state.splitView.columns)
        .map((row) => row.map((entryPaneId) => entryPaneId === paneId ? nextPane.paneId : entryPaneId))
    const splitView = normalizeSplitViewState({ ...state, focusSnapshot: snapshot } as StudioState, {
        panes,
        activePaneId: nextPane.paneId,
        rows,
        rowWeights: state.splitView.rowWeights,
        columnWeights: state.splitView.columnWeights,
        columns: state.splitView.columns,
    })

    set({
        focusSnapshot: snapshot,
        ...buildSplitViewLayoutState({ ...state, focusSnapshot: snapshot } as StudioState, splitView, viewportSize),
    })
}

export function moveSplitViewPaneImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    paneId: string,
    placement: number | SplitViewPlacement,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const panes = movePaneToIndex(state.splitView.panes, paneId, Number.POSITIVE_INFINITY)
    const baseRows = splitRowsFromPanes(state.splitView.panes, state.splitView.rows || state.splitView.columns)
    const rows = insertPaneInRows(baseRows, paneId, normalizeSplitViewPlacement(state.splitView.panes, baseRows, placement))
    const splitView = normalizeSplitViewState(state, {
        panes,
        activePaneId: paneId,
        rows,
        rowWeights: state.splitView.rowWeights,
        columnWeights: state.splitView.columnWeights,
        columns: state.splitView.columns,
    })

    set(buildSplitViewLayoutState(state, splitView, viewportSize))
}

export function setSplitViewActivePaneImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    nodeId: string,
    nodeType: FocusNodeType,
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const pane = state.splitView.panes.find((entry) => entry.nodeId === nodeId && entry.type === nodeType)
    if (!pane) {
        return
    }

    set({
        splitView: {
            ...state.splitView,
            activePaneId: pane.paneId,
        },
        selectedAgentId: nodeType === 'agent' ? nodeId : null,
        selectedTeamId: nodeType === 'team' ? nodeId : null,
        activeChatAgentId: nodeType === 'agent' ? nodeId : state.activeChatAgentId,
    })
}
