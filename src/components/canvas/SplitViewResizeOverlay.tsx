import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useStudioStore } from '../../store'
import { resolveSplitPaneRects, SPLIT_VIEW_GAP } from '../../lib/focus-utils'
import type { SplitViewState, WorkspaceViewMode } from '../../store/workspace/types'
import './SplitViewResizeOverlay.css'

type Props = {
    viewMode: WorkspaceViewMode
    splitView: SplitViewState
    viewportSize: { width: number; height: number } | null
}

type ResizeAxis = 'row' | 'column'
type DragSession = {
    axis: ResizeAxis
    rowIndex: number
    boundaryIndex: number
    lastClientX: number
    lastClientY: number
}

type ResizeHandle = {
    key: string
    axis: ResizeAxis
    rowIndex: number
    boundaryIndex: number
    style: CSSProperties
}

function handleClientPoint(event: PointerEvent) {
    return {
        x: event.clientX,
        y: event.clientY,
    }
}

export default function SplitViewResizeOverlay({ viewMode, splitView, viewportSize }: Props) {
    const resizeSplitViewBoundary = useStudioStore((state) => state.resizeSplitViewBoundary)
    const dragSessionRef = useRef<DragSession | null>(null)
    const [dragging, setDragging] = useState<DragSession | null>(null)

    const handles = useMemo<ResizeHandle[]>(() => {
        if (viewMode !== 'split' || !viewportSize || splitView.panes.length === 0) {
            return []
        }

        const paneRects = resolveSplitPaneRects(
            splitView.panes,
            viewportSize,
            splitView.rows,
            splitView,
        )
        const rowHandles = splitView.rows.slice(0, -1).flatMap((_, rowIndex) => {
            const rowRect = paneRects.find((rect) => rect.rowIndex === rowIndex)
            if (!rowRect) {
                return []
            }

            const top = rowRect.rowY + rowRect.rowHeight + (SPLIT_VIEW_GAP / 2) - 5
            return [{
                key: `row:${rowIndex}`,
                axis: 'row' as const,
                rowIndex,
                boundaryIndex: rowIndex,
                style: {
                    left: 0,
                    top,
                    width: viewportSize.width,
                    height: 10,
                },
            }]
        })

        const columnHandles = splitView.rows.flatMap((row, rowIndex) => {
            if (row.length < 2) {
                return []
            }

            const rowRects = paneRects
                .filter((rect) => rect.rowIndex === rowIndex)
                .sort((a, b) => a.columnIndex - b.columnIndex)

            return rowRects.slice(0, -1).map((rect) => ({
                key: `column:${rowIndex}:${rect.columnIndex}`,
                axis: 'column' as const,
                rowIndex,
                boundaryIndex: rect.columnIndex,
                style: {
                    left: rect.x + rect.width + (SPLIT_VIEW_GAP / 2) - 5,
                    top: rect.rowY,
                    width: 10,
                    height: rect.rowHeight,
                },
            }))
        })

        return [...rowHandles, ...columnHandles]
    }, [splitView, viewportSize, viewMode])

    const beginResize = useCallback((
        event: ReactPointerEvent<HTMLButtonElement>,
        handle: ResizeHandle,
    ) => {
        event.preventDefault()
        event.stopPropagation()
        const session = {
            axis: handle.axis,
            rowIndex: handle.rowIndex,
            boundaryIndex: handle.boundaryIndex,
            lastClientX: event.clientX,
            lastClientY: event.clientY,
        }
        dragSessionRef.current = session
        setDragging(session)
    }, [])

    useEffect(() => {
        if (!dragging || !viewportSize) {
            return
        }

        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect
        document.body.style.cursor = dragging.axis === 'row' ? 'row-resize' : 'col-resize'
        document.body.style.userSelect = 'none'

        const handleMove = (event: PointerEvent) => {
            const session = dragSessionRef.current
            if (!session) {
                return
            }

            event.preventDefault()
            const point = handleClientPoint(event)
            const deltaPx = session.axis === 'row'
                ? point.y - session.lastClientY
                : point.x - session.lastClientX
            if (deltaPx !== 0) {
                resizeSplitViewBoundary(session.axis, session.rowIndex, session.boundaryIndex, deltaPx, viewportSize)
            }
            dragSessionRef.current = {
                ...session,
                lastClientX: point.x,
                lastClientY: point.y,
            }
        }

        const finishResize = () => {
            dragSessionRef.current = null
            setDragging(null)
        }

        window.addEventListener('pointermove', handleMove, { passive: false })
        window.addEventListener('pointerup', finishResize)
        window.addEventListener('pointercancel', finishResize)
        return () => {
            document.body.style.cursor = previousCursor
            document.body.style.userSelect = previousUserSelect
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', finishResize)
            window.removeEventListener('pointercancel', finishResize)
        }
    }, [dragging, resizeSplitViewBoundary, viewportSize])

    if (handles.length === 0) {
        return null
    }

    return (
        <div className={`split-view-resize-overlay ${dragging ? 'is-resizing' : ''}`} aria-hidden="true">
            {handles.map((handle) => (
                <button
                    key={handle.key}
                    type="button"
                    className={`split-view-resize-overlay__handle split-view-resize-overlay__handle--${handle.axis}`}
                    style={handle.style}
                    tabIndex={-1}
                    title={handle.axis === 'row' ? 'Resize split row' : 'Resize split column'}
                    onPointerDown={(event) => beginResize(event, handle)}
                    onDragStart={(event) => event.preventDefault()}
                />
            ))}
        </div>
    )
}
