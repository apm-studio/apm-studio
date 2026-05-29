import type {
    FullscreenNodeType,
    SplitViewPane,
    SplitViewPlacement,
    SplitViewState,
} from '../store/workspace/types'
import type { ViewportSize } from './focus-viewport'

export const DEFAULT_SPLIT_VIEW_COLUMNS = 2
export const MIN_SPLIT_VIEW_COLUMNS = 1
export const MAX_SPLIT_VIEW_COLUMNS = 4
export const SPLIT_VIEW_MAX_PANES = 12
export const SPLIT_VIEW_GAP = 8
export const SPLIT_VIEW_MIN_PANE_WIDTH = 220
export const SPLIT_VIEW_MIN_PANE_HEIGHT = 160

type SplitGridRect = { index: number; rowIndex: number; columnIndex: number; x: number; y: number; width: number; height: number }
type SplitPaneRect = SplitViewPane & SplitGridRect & { rowX: number; rowY: number; rowWidth: number; rowHeight: number }
type SplitViewSizingInput = Pick<SplitViewState, 'rowWeights' | 'columnWeights'>
export type SplitDropDirection = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'empty'
export type SplitDropIntent = {
    paneId: string | null
    targetIndex: number | null
    placement: SplitViewPlacement | null
    direction: SplitDropDirection
    previewRect: SplitGridRect
}

export function createEmptySplitViewState(): SplitViewState {
    return {
        panes: [],
        activePaneId: null,
        rows: [],
        rowWeights: [],
        columnWeights: [],
        columns: DEFAULT_SPLIT_VIEW_COLUMNS,
    }
}

export function createSplitViewPane(nodeId: string, nodeType: FullscreenNodeType) {
    return {
        paneId: `${nodeType}:${nodeId}`,
        nodeId,
        type: nodeType,
    }
}

export function clampSplitViewColumns(columns: number) {
    if (!Number.isFinite(columns)) return DEFAULT_SPLIT_VIEW_COLUMNS
    return Math.min(MAX_SPLIT_VIEW_COLUMNS, Math.max(MIN_SPLIT_VIEW_COLUMNS, Math.round(columns)))
}

function rowsFromColumns(panes: SplitViewPane[], columns: number) {
    const safeColumns = clampSplitViewColumns(columns)
    const rows: string[][] = []
    for (let index = 0; index < panes.length; index += safeColumns) {
        rows.push(panes.slice(index, index + safeColumns).map((pane) => pane.paneId))
    }

    return rows
}

export function resolveSplitViewRows(
    panes: SplitViewPane[],
    rowsOrColumns: string[][] | number | undefined,
) {
    const paneIds = new Set(panes.map((pane) => pane.paneId))
    const seen = new Set<string>()
    const sourceRows = Array.isArray(rowsOrColumns) && rowsOrColumns.length > 0
        ? rowsOrColumns
        : rowsFromColumns(panes, typeof rowsOrColumns === 'number' ? rowsOrColumns : DEFAULT_SPLIT_VIEW_COLUMNS)
    const rows = sourceRows.map((row) => (
        row.filter((paneId) => {
            if (!paneIds.has(paneId) || seen.has(paneId)) {
                return false
            }
            seen.add(paneId)
            return true
        })
    )).filter((row) => row.length > 0)

    const missingPaneIds = panes
        .map((pane) => pane.paneId)
        .filter((paneId) => !seen.has(paneId))
    return [
        ...rows,
        ...missingPaneIds.map((paneId) => [paneId]),
    ]
}

export function normalizeSplitWeights(weights: number[] | undefined, count: number) {
    if (count <= 0) {
        return []
    }

    return Array.from({ length: count }, (_, index) => {
        const weight = weights?.[index]
        return typeof weight === 'number' && Number.isFinite(weight) && weight > 0
            ? weight
            : 1
    })
}

export function normalizeSplitViewSizing(
    rows: string[][],
    sizing?: Partial<SplitViewSizingInput>,
): SplitViewSizingInput {
    return {
        rowWeights: normalizeSplitWeights(sizing?.rowWeights, rows.length),
        columnWeights: rows.map((row, rowIndex) => normalizeSplitWeights(sizing?.columnWeights?.[rowIndex], row.length)),
    }
}

function weightedTrackSizes(
    totalSize: number,
    gapSize: number,
    weights: number[],
) {
    const count = weights.length
    if (count === 0) {
        return []
    }

    const availableSize = Math.max(1, totalSize - Math.max(0, count - 1) * gapSize)
    const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0.0001, weight), 0)
    let offset = 0

    return weights.map((weight, index) => {
        const isLast = index === count - 1
        const size = isLast
            ? Math.max(1, totalSize - offset)
            : Math.max(1, Math.round((Math.max(0.0001, weight) / totalWeight) * availableSize))
        const track = { offset, size }
        offset += size + gapSize
        return track
    })
}

export function resolveSplitPaneRects(
    panes: SplitViewPane[],
    viewportSize: ViewportSize,
    rowsOrColumns: string[][] | number | undefined,
    sizing?: Partial<SplitViewSizingInput>,
): SplitPaneRect[] {
    const safePanes = panes.slice(0, SPLIT_VIEW_MAX_PANES)
    const paneById = new Map(safePanes.map((pane, index) => [pane.paneId, { pane, index }]))
    const rows = resolveSplitViewRows(safePanes, rowsOrColumns)
    const normalizedSizing = normalizeSplitViewSizing(rows, sizing)
    const width = Math.max(1, viewportSize.width)
    const height = Math.max(1, viewportSize.height)
    if (rows.length === 0) {
        return []
    }

    const rowTracks = weightedTrackSizes(height, SPLIT_VIEW_GAP, normalizedSizing.rowWeights)
    return rows.flatMap((row, rowIndex) => {
        const rowTrack = rowTracks[rowIndex] || { offset: 0, size: height }
        const y = rowTrack.offset
        const rowHeight = rowTrack.size
        const columnTracks = weightedTrackSizes(width, SPLIT_VIEW_GAP, normalizedSizing.columnWeights[rowIndex] || [])

        return row.flatMap((paneId, columnIndex) => {
            const entry = paneById.get(paneId)
            if (!entry) {
                return []
            }

            const columnTrack = columnTracks[columnIndex] || { offset: 0, size: width }
            const x = columnTrack.offset
            const columnWidth = columnTrack.size

            return [{
                ...entry.pane,
                index: entry.index,
                rowIndex,
                columnIndex,
                x,
                y,
                width: columnWidth,
                height: rowHeight,
                rowX: 0,
                rowY: y,
                rowWidth: width,
                rowHeight,
            }]
        })
    })
}

function closestSplitPaneRect(point: { x: number; y: number }, paneRects: SplitPaneRect[]) {
    return paneRects.reduce<SplitPaneRect | null>((closest, rect) => {
        const centerX = rect.x + rect.width / 2
        const centerY = rect.y + rect.height / 2
        const distance = Math.hypot(point.x - centerX, point.y - centerY)
        if (!closest) {
            return rect
        }

        const closestCenterX = closest.x + closest.width / 2
        const closestCenterY = closest.y + closest.height / 2
        const closestDistance = Math.hypot(point.x - closestCenterX, point.y - closestCenterY)
        return distance < closestDistance ? rect : closest
    }, null)
}

function splitDropDirection(point: { x: number; y: number }, rect: SplitPaneRect): Exclude<SplitDropDirection, 'center' | 'empty'> {
    const distances = [
        { direction: 'left' as const, value: Math.abs(point.x - rect.x) },
        { direction: 'right' as const, value: Math.abs((rect.x + rect.width) - point.x) },
        { direction: 'top' as const, value: Math.abs(point.y - rect.y) },
        { direction: 'bottom' as const, value: Math.abs((rect.y + rect.height) - point.y) },
    ]
    distances.sort((a, b) => a.value - b.value)
    return distances[0].direction
}

function previewRectForDirection(rect: SplitPaneRect, direction: SplitDropDirection): SplitGridRect {
    const previewWidth = Math.max(1, Math.round(rect.width / 2))
    const previewHeight = Math.max(1, Math.round(rect.height / 2))

    if (direction === 'left') {
        return { index: rect.index, rowIndex: rect.rowIndex, columnIndex: rect.columnIndex, x: rect.x, y: rect.y, width: previewWidth, height: rect.height }
    }

    if (direction === 'right') {
        return { index: rect.index, rowIndex: rect.rowIndex, columnIndex: rect.columnIndex, x: rect.x + rect.width - previewWidth, y: rect.y, width: previewWidth, height: rect.height }
    }

    if (direction === 'top') {
        return { index: rect.index, rowIndex: rect.rowIndex, columnIndex: 0, x: rect.rowX, y: rect.rowY, width: rect.rowWidth, height: previewHeight }
    }

    if (direction === 'bottom') {
        return { index: rect.index, rowIndex: rect.rowIndex, columnIndex: 0, x: rect.rowX, y: rect.rowY + rect.rowHeight - previewHeight, width: rect.rowWidth, height: previewHeight }
    }

    return { index: rect.index, rowIndex: rect.rowIndex, columnIndex: rect.columnIndex, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

export function resolveSplitDropIntent(args: {
    point: { x: number; y: number }
    panes: SplitViewPane[]
    viewportSize: ViewportSize
    rows?: string[][]
    rowWeights?: number[]
    columnWeights?: number[][]
    columns?: number
    canPlaceAtEdge: boolean
}): SplitDropIntent | null {
    const { point, panes, viewportSize, rows, rowWeights, columnWeights, columns, canPlaceAtEdge } = args
    if (
        point.x < 0
        || point.y < 0
        || point.x > viewportSize.width
        || point.y > viewportSize.height
    ) {
        return null
    }

    if (panes.length === 0) {
        return {
            paneId: null,
            targetIndex: 0,
            placement: { rowIndex: 0, columnIndex: 0, rowMode: 'new' },
            direction: 'empty',
            previewRect: {
                index: 0,
                rowIndex: 0,
                columnIndex: 0,
                x: 0,
                y: 0,
                width: Math.max(1, viewportSize.width),
                height: Math.max(1, viewportSize.height),
            },
        }
    }

    const paneRects = resolveSplitPaneRects(panes, viewportSize, rows ?? columns, { rowWeights, columnWeights })
    const containingRect = paneRects.find((rect) => (
        point.x >= rect.x
        && point.x <= rect.x + rect.width
        && point.y >= rect.y
        && point.y <= rect.y + rect.height
    )) || closestSplitPaneRect(point, paneRects)
    if (!containingRect) {
        return null
    }

    const direction = canPlaceAtEdge ? splitDropDirection(point, containingRect) : 'center'
    const insertAfter = direction === 'right'
    const targetIndex = direction === 'center'
        ? containingRect.index
        : containingRect.index + ((direction === 'right' || direction === 'bottom') ? 1 : 0)
    const placement = direction === 'center'
        ? null
        : {
            rowIndex: direction === 'bottom'
                ? containingRect.rowIndex + 1
                : containingRect.rowIndex,
            columnIndex: (direction === 'left' || direction === 'right')
                ? containingRect.columnIndex + (insertAfter ? 1 : 0)
                : 0,
            rowMode: (direction === 'top' || direction === 'bottom') ? 'new' as const : 'existing' as const,
        }

    return {
        paneId: containingRect.paneId,
        targetIndex,
        placement,
        direction,
        previewRect: previewRectForDirection(containingRect, direction),
    }
}
