import {
    clampSplitViewColumns,
    createEmptySplitViewState,
    DEFAULT_SPLIT_VIEW_COLUMNS,
    normalizeSplitViewSizing,
    resolveSplitPaneRects,
    resolveSplitViewRows,
    SPLIT_VIEW_GAP,
    SPLIT_VIEW_MAX_PANES,
    SPLIT_VIEW_MIN_PANE_HEIGHT,
    SPLIT_VIEW_MIN_PANE_WIDTH,
} from '../../lib/focus-utils'
import type {
    FullscreenNodeType,
    SplitViewPane,
    SplitViewPlacement,
    SplitViewState,
} from './types'
import type { StudioState } from '../types'

type FocusNodeType = FullscreenNodeType
type FocusTarget = { id: string; type: FocusNodeType }
type ViewportSize = { width: number; height: number }
type SplitViewStateInput = Pick<SplitViewState, 'panes' | 'activePaneId'> & Partial<Omit<SplitViewState, 'panes' | 'activePaneId'>>

export function resolveCanvasResetSplitView(state: StudioState): SplitViewState {
    return state.splitView?.panes.length
        ? state.splitView
        : createEmptySplitViewState()
}

export function targetExists(state: StudioState, target: FocusTarget) {
    return target.type === 'agent'
        ? state.agents.some((entry) => entry.id === target.id)
        : state.teams.some((entry) => entry.id === target.id)
}

export function resolveSplitViewTarget(state: StudioState): FocusTarget | null {
    const activePane = state.splitView.panes.find((pane) => (
        pane.paneId === state.splitView.activePaneId
        && targetExists(state, { id: pane.nodeId, type: pane.type })
    ))
    const fallbackPane = activePane || state.splitView.panes.find((pane) => (
        targetExists(state, { id: pane.nodeId, type: pane.type })
    ))

    return fallbackPane
        ? { id: fallbackPane.nodeId, type: fallbackPane.type }
        : null
}

export function resolveSelectedFullscreenTarget(state: StudioState): FocusTarget | null {
    if (state.selectedAgentId) {
        return { id: state.selectedAgentId, type: 'agent' }
    }

    if (state.selectedTeamId) {
        return { id: state.selectedTeamId, type: 'team' }
    }

    const firstVisibleTeam = state.teams.find((team) => !team.hidden)
    if (firstVisibleTeam) {
        return { id: firstVisibleTeam.id, type: 'team' }
    }

    const firstVisibleAgent = state.agents.find((agent) => !agent.hidden)
    return firstVisibleAgent
        ? { id: firstVisibleAgent.id, type: 'agent' }
        : null
}

export function sanitizeSplitViewPanes(state: StudioState, panes: SplitViewPane[]) {
    const seen = new Set<string>()
    const next: SplitViewPane[] = []

    for (const pane of panes) {
        const key = `${pane.type}:${pane.nodeId}`
        if (seen.has(key) || !targetExists(state, { id: pane.nodeId, type: pane.type })) {
            continue
        }
        seen.add(key)
        next.push(pane)
        if (next.length >= SPLIT_VIEW_MAX_PANES) {
            break
        }
    }

    return next
}

export function normalizeSplitViewState(state: StudioState, splitView: SplitViewStateInput): SplitViewState {
    const panes = sanitizeSplitViewPanes(state, splitView.panes)
    const rows = resolveSplitViewRows(panes, splitView.rows || splitView.columns)
    const sizing = normalizeSplitViewSizing(rows, {
        rowWeights: splitView.rowWeights,
        columnWeights: splitView.columnWeights,
    })
    const paneById = new Map(panes.map((pane) => [pane.paneId, pane]))
    const orderedPanes = rows
        .flat()
        .map((paneId) => paneById.get(paneId))
        .filter((pane): pane is SplitViewPane => Boolean(pane))
    const activePaneId = panes.some((pane) => pane.paneId === splitView.activePaneId)
        ? splitView.activePaneId
        : orderedPanes[0]?.paneId || null

    return {
        panes: orderedPanes,
        activePaneId,
        rows,
        rowWeights: sizing.rowWeights,
        columnWeights: sizing.columnWeights,
        columns: clampSplitViewColumns(Math.max(1, ...rows.map((row) => row.length), splitView.columns ?? DEFAULT_SPLIT_VIEW_COLUMNS)),
    }
}

export function buildSplitViewLayoutState(
    state: StudioState,
    requestedSplitView: SplitViewState,
    viewportSize: ViewportSize,
): Partial<StudioState> {
    const splitView = normalizeSplitViewState(state, requestedSplitView)
    const paneRects = resolveSplitPaneRects(splitView.panes, viewportSize, splitView.rows, splitView)
    const paneRectByKey = new Map(paneRects.map((rect) => [`${rect.type}:${rect.nodeId}`, rect]))
    const activePane = splitView.panes.find((pane) => pane.paneId === splitView.activePaneId) || splitView.panes[0] || null

    return {
        viewMode: 'split',
        splitView,
        selectedAgentId: activePane?.type === 'agent' ? activePane.nodeId : null,
        selectedTeamId: activePane?.type === 'team' ? activePane.nodeId : null,
        activeChatAgentId: activePane?.type === 'agent' ? activePane.nodeId : state.activeChatAgentId,
        agents: state.agents.map((agent) => {
            const rect = paneRectByKey.get(`agent:${agent.id}`)
            return rect
                ? { ...agent, hidden: false, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height }
                : { ...agent, hidden: true }
        }),
        teams: state.teams.map((team) => {
            const rect = paneRectByKey.get(`team:${team.id}`)
            return rect
                ? { ...team, hidden: false, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height }
                : { ...team, hidden: true }
        }),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: true })),
        isPackageLibraryOpen: false,
        isAssistantOpen: false,
        isTrackingOpen: false,
        isTerminalOpen: false,
        editingTarget: null,
        inspectorFocus: null,
    }
}

function clampSplitViewInsertIndex(index: number, length: number) {
    if (!Number.isFinite(index)) {
        return length
    }

    return Math.min(length, Math.max(0, Math.round(index)))
}

export function splitRowsFromPanes(panes: SplitViewPane[], rowsOrColumns: string[][] | number | undefined) {
    return resolveSplitViewRows(panes, rowsOrColumns)
}

function placementFromIndex(panes: SplitViewPane[], rows: string[][], index: number): SplitViewPlacement {
    const insertIndex = clampSplitViewInsertIndex(index, panes.length)
    if (insertIndex >= panes.length) {
        return rows.length > 0
            ? { rowIndex: rows.length - 1, columnIndex: rows[rows.length - 1].length, rowMode: 'existing' }
            : { rowIndex: 0, columnIndex: 0, rowMode: 'new' }
    }

    const paneId = panes[insertIndex]?.paneId
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const columnIndex = rows[rowIndex].indexOf(paneId)
        if (columnIndex >= 0) {
            return { rowIndex, columnIndex, rowMode: 'existing' }
        }
    }

    return { rowIndex: rows.length, columnIndex: 0, rowMode: 'new' }
}

export function normalizeSplitViewPlacement(
    panes: SplitViewPane[],
    rows: string[][],
    placement: number | SplitViewPlacement,
) {
    if (typeof placement === 'number') {
        return placementFromIndex(panes, rows, placement)
    }

    const rowIndex = Math.min(
        placement.rowMode === 'new' ? rows.length : Math.max(0, rows.length - 1),
        Math.max(0, Math.round(placement.rowIndex)),
    )
    const targetRow = rows[rowIndex] || []
    const columnIndex = Math.min(targetRow.length, Math.max(0, Math.round(placement.columnIndex)))

    return {
        rowIndex,
        columnIndex,
        rowMode: placement.rowMode || 'existing',
    } satisfies SplitViewPlacement
}

export function insertPaneInRows(rows: string[][], paneId: string, placement: SplitViewPlacement) {
    const nextRows = rows
        .map((row) => row.filter((entryId) => entryId !== paneId))
        .filter((row) => row.length > 0)
    const target = normalizeSplitViewPlacement([], nextRows, placement)

    if (target.rowMode === 'new' || nextRows.length === 0) {
        return [
            ...nextRows.slice(0, target.rowIndex),
            [paneId],
            ...nextRows.slice(target.rowIndex),
        ]
    }

    const targetRow = nextRows[target.rowIndex] || []
    return nextRows.map((row, rowIndex) => (
        rowIndex === target.rowIndex
            ? [
                ...targetRow.slice(0, target.columnIndex),
                paneId,
                ...targetRow.slice(target.columnIndex),
            ]
            : row
    ))
}

export function insertPaneAtIndex(panes: SplitViewPane[], pane: SplitViewPane, index: number) {
    const insertIndex = clampSplitViewInsertIndex(index, panes.length)
    return [
        ...panes.slice(0, insertIndex),
        pane,
        ...panes.slice(insertIndex),
    ]
}

export function movePaneToIndex(panes: SplitViewPane[], paneId: string, index: number) {
    const pane = panes.find((entry) => entry.paneId === paneId)
    if (!pane) {
        return panes
    }

    const remainingPanes = panes.filter((entry) => entry.paneId !== paneId)
    return insertPaneAtIndex(remainingPanes, pane, index)
}

function resolveSplitResizeMinSize(availableSize: number, trackCount: number, preferredMinSize: number) {
    if (trackCount <= 1) {
        return 1
    }

    const evenTrackSize = availableSize / trackCount
    return Math.max(40, Math.min(preferredMinSize, evenTrackSize * 0.75))
}

export function resizeAdjacentWeights(
    weights: number[],
    boundaryIndex: number,
    deltaPx: number,
    totalSize: number,
    preferredMinSize: number,
) {
    const count = weights.length
    if (count < 2 || boundaryIndex < 0 || boundaryIndex >= count - 1 || !Number.isFinite(deltaPx)) {
        return weights
    }

    const availableSize = Math.max(1, totalSize - Math.max(0, count - 1) * SPLIT_VIEW_GAP)
    const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0.0001, weight), 0)
    const trackSizes = weights.map((weight) => (Math.max(0.0001, weight) / totalWeight) * availableSize)
    const pairSize = trackSizes[boundaryIndex] + trackSizes[boundaryIndex + 1]
    const minSize = Math.min(resolveSplitResizeMinSize(availableSize, count, preferredMinSize), pairSize / 2)
    const firstSize = Math.min(pairSize - minSize, Math.max(minSize, trackSizes[boundaryIndex] + deltaPx))
    const secondSize = pairSize - firstSize
    const nextTrackSizes = [...trackSizes]
    nextTrackSizes[boundaryIndex] = firstSize
    nextTrackSizes[boundaryIndex + 1] = secondSize

    return nextTrackSizes.map((size) => Math.max(0.0001, (size / availableSize) * totalWeight))
}

export const SPLIT_VIEW_RESIZE_MIN = {
    row: SPLIT_VIEW_MIN_PANE_HEIGHT,
    column: SPLIT_VIEW_MIN_PANE_WIDTH,
} as const
