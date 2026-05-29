import {
    getCanvasViewportSize,
    normalizeSplitViewSizing,
    normalizeSplitWeights,
} from '../../lib/focus-utils'
import {
    buildSplitViewLayoutState,
    resizeAdjacentWeights,
    splitRowsFromPanes,
    SPLIT_VIEW_RESIZE_MIN,
} from './split-view-layout'
import type {
    WorkspaceGetState,
    WorkspaceSetState,
} from './action-context'
import type {
    SplitViewState,
} from './types'

type ViewportSize = { width: number; height: number }

export function resizeSplitViewBoundaryImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    axis: 'row' | 'column',
    rowIndex: number,
    boundaryIndex: number,
    deltaPx: number,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const rows = splitRowsFromPanes(state.splitView.panes, state.splitView.rows || state.splitView.columns)
    if (rows.length === 0) {
        return
    }

    const sizing = normalizeSplitViewSizing(rows, state.splitView)
    const splitView: SplitViewState = {
        ...state.splitView,
        rows,
        rowWeights: sizing.rowWeights,
        columnWeights: sizing.columnWeights,
    }

    if (axis === 'row') {
        splitView.rowWeights = resizeAdjacentWeights(
            normalizeSplitWeights(splitView.rowWeights, rows.length),
            boundaryIndex,
            deltaPx,
            viewportSize.height,
            SPLIT_VIEW_RESIZE_MIN.row,
        )
    } else {
        const row = rows[rowIndex]
        if (!row || row.length < 2) {
            return
        }

        splitView.columnWeights = splitView.columnWeights.map((weights, currentRowIndex) => (
            currentRowIndex === rowIndex
                ? resizeAdjacentWeights(
                    normalizeSplitWeights(weights, row.length),
                    boundaryIndex,
                    deltaPx,
                    viewportSize.width,
                    SPLIT_VIEW_RESIZE_MIN.column,
                )
                : weights
        ))
    }

    set(buildSplitViewLayoutState(state, splitView, viewportSize))
}

export function setSplitViewColumnsImpl(
    get: WorkspaceGetState,
    set: WorkspaceSetState,
    columns: number,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const splitView = {
        ...state.splitView,
        rows: splitRowsFromPanes(state.splitView.panes, columns),
        columns,
    }

    set(buildSplitViewLayoutState(state, splitView, viewportSize))
}
