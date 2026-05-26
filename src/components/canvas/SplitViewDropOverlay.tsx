import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Columns2, Users, Workflow } from 'lucide-react'
import type { DragAsset } from '../../lib/dnd-handlers'
import { isSplitPaneDrag, isSplitViewNodeDrag } from '../../lib/dnd-handlers'
import { resolveSplitDropIntent, SPLIT_VIEW_MAX_PANES } from '../../lib/focus-utils'
import type { FullscreenNodeType, SplitViewState, WorkspaceViewMode } from '../../store/types'
import type { PerformerNode, WorkspaceAct } from '../../types'
import './SplitViewDropOverlay.css'

type ActiveDragLike = {
    data?: {
        current?: unknown
    }
} | null

type Props = {
    active: ActiveDragLike
    viewMode: WorkspaceViewMode
    splitView: SplitViewState
    viewportSize: { width: number; height: number } | null
    acts: WorkspaceAct[]
    performers: PerformerNode[]
}

function nodeLabel(nodeId: string, nodeType: FullscreenNodeType, acts: WorkspaceAct[], performers: PerformerNode[]) {
    if (nodeType === 'act') {
        return acts.find((act) => act.id === nodeId)?.name || 'Team'
    }

    return performers.find((performer) => performer.id === nodeId)?.name || 'Agent'
}

function nodeIcon(nodeType: FullscreenNodeType) {
    return nodeType === 'act' ? <Workflow size={13} /> : <Users size={13} />
}

function slotStyle(slot: { x: number; y: number; width: number; height: number }): CSSProperties {
    return {
        left: slot.x,
        top: slot.y,
        width: slot.width,
        height: slot.height,
    }
}

function clientPointFromEvent(event: PointerEvent | TouchEvent) {
    if ('touches' in event && event.touches.length > 0) {
        const touch = event.touches[0]
        return { x: touch.clientX, y: touch.clientY }
    }

    if ('changedTouches' in event && event.changedTouches.length > 0) {
        const touch = event.changedTouches[0]
        return { x: touch.clientX, y: touch.clientY }
    }

    return { x: (event as PointerEvent).clientX, y: (event as PointerEvent).clientY }
}

function canvasPointFromClient(clientPoint: { x: number; y: number } | null) {
    if (!clientPoint || typeof document === 'undefined') {
        return null
    }

    const shell = document.querySelector<HTMLElement>('.canvas-flow-shell')
    const rect = shell?.getBoundingClientRect()
    if (!rect) {
        return null
    }

    return {
        x: clientPoint.x - rect.left,
        y: clientPoint.y - rect.top,
    }
}

function intentLabel(direction: string, isReordering: boolean) {
    if (direction === 'center') return 'Replace'
    if (direction === 'empty') return 'Add here'
    return isReordering ? 'Move here' : 'Place here'
}

function dragKeyFromData(dragData: DragAsset | undefined) {
    if (!isSplitViewNodeDrag(dragData)) {
        return null
    }

    return `${dragData.source}:${dragData.paneId || 'workspace'}:${dragData.nodeType}:${dragData.nodeId}`
}

export default function SplitViewDropOverlay({
    active,
    viewMode,
    splitView,
    viewportSize,
    acts,
    performers,
}: Props) {
    const [trackedPoint, setTrackedPoint] = useState<{ key: string; point: { x: number; y: number } } | null>(null)
    const dragData = active?.data?.current as DragAsset | undefined
    const isDraggingSplitNode = isSplitViewNodeDrag(dragData)
    const isReordering = isSplitPaneDrag(dragData)
    const dragKey = dragKeyFromData(dragData)

    useEffect(() => {
        if (!isDraggingSplitNode || !dragKey) {
            return
        }

        const handleMove = (event: PointerEvent | TouchEvent) => {
            setTrackedPoint({ key: dragKey, point: clientPointFromEvent(event) })
        }

        window.addEventListener('pointermove', handleMove)
        window.addEventListener('touchmove', handleMove, { passive: true })
        return () => {
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('touchmove', handleMove)
        }
    }, [dragKey, isDraggingSplitNode])

    const alreadyOpen = isDraggingSplitNode
        ? splitView.panes.some((pane) => pane.nodeId === dragData?.nodeId && pane.type === dragData?.nodeType)
        : false
    const canAddPane = splitView.panes.length < SPLIT_VIEW_MAX_PANES || alreadyOpen || isReordering
    const canvasPoint = useMemo(() => (
        dragKey && trackedPoint?.key === dragKey
            ? canvasPointFromClient(trackedPoint.point)
            : null
    ), [dragKey, trackedPoint])
    const intent = useMemo(() => {
        if (!isDraggingSplitNode || viewMode !== 'split' || !canvasPoint || !viewportSize) {
            return null
        }

        return resolveSplitDropIntent({
            point: canvasPoint,
            panes: splitView.panes,
            viewportSize,
            rows: splitView.rows,
            rowWeights: splitView.rowWeights,
            columnWeights: splitView.columnWeights,
            canPlaceAtEdge: canAddPane,
        })
    }, [canAddPane, canvasPoint, isDraggingSplitNode, splitView.columnWeights, splitView.panes, splitView.rowWeights, splitView.rows, viewportSize, viewMode])

    if (!isSplitViewNodeDrag(dragData) || viewMode === 'canvas') {
        return null
    }

    if (viewMode === 'full') {
        return (
            <div className="split-view-drop-overlay split-view-drop-overlay--full" aria-hidden="true">
                <div className="split-view-drop-overlay__full-target">
                    <Columns2 size={16} />
                    <strong>Open Split View</strong>
                    <span>{nodeLabel(dragData.nodeId, dragData.nodeType, acts, performers)}</span>
                </div>
            </div>
        )
    }

    const intentPane = intent?.paneId
        ? splitView.panes.find((pane) => pane.paneId === intent.paneId) || null
        : null

    return (
        <div className="split-view-drop-overlay" aria-hidden="true">
            {intent ? (
                <div
                    className={`split-view-drop-overlay__intent split-view-drop-overlay__intent--${intent.direction}`}
                    style={slotStyle(intent.previewRect)}
                >
                    <div className="split-view-drop-overlay__target-card">
                        {intentPane ? nodeIcon(intentPane.type) : <Columns2 size={13} />}
                        <strong>{intentLabel(intent.direction, isReordering)}</strong>
                        <span>
                            {intentPane
                                ? nodeLabel(
                                    intentPane.nodeId,
                                    intentPane.type,
                                    acts,
                                    performers,
                                )
                                : `${Math.min(splitView.panes.length + 1, SPLIT_VIEW_MAX_PANES)}/${SPLIT_VIEW_MAX_PANES}`}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="split-view-drop-overlay__hint">
                    <Columns2 size={14} />
                    <strong>Drop near an edge</strong>
                </div>
            )}
        </div>
    )
}
