import type { DragEndEvent } from '@dnd-kit/core'

import type { StudioState } from './store/types'
import { resolveFocusTarget, resolveSplitDropIntent, SPLIT_VIEW_MAX_PANES } from './lib/focus-utils'
import {
    isSplitPaneDrag,
    isSplitViewNodeDrag,
    type DragPrimitive,
} from './lib/dnd-handlers'

function dragEndClientPoint(event: DragEndEvent) {
    const activatorEvent = event.activatorEvent
    if ('clientX' in activatorEvent && 'clientY' in activatorEvent) {
        const pointerEvent = activatorEvent as MouseEvent
        return {
            x: pointerEvent.clientX + event.delta.x,
            y: pointerEvent.clientY + event.delta.y,
        }
    }

    if ('touches' in activatorEvent && (activatorEvent as TouchEvent).touches.length > 0) {
        const touch = (activatorEvent as TouchEvent).touches[0]
        return {
            x: touch.clientX + event.delta.x,
            y: touch.clientY + event.delta.y,
        }
    }

    if ('changedTouches' in activatorEvent && (activatorEvent as TouchEvent).changedTouches.length > 0) {
        const touch = (activatorEvent as TouchEvent).changedTouches[0]
        return {
            x: touch.clientX + event.delta.x,
            y: touch.clientY + event.delta.y,
        }
    }

    return null
}

function resolveSplitDropPoint(event: DragEndEvent, store: StudioState, primitive: DragPrimitive) {
    if (typeof document === 'undefined') {
        return null
    }

    const point = dragEndClientPoint(event)
    const shell = document.querySelector('.canvas-flow-shell')
    if (!point || !shell) {
        return null
    }

    const rect = shell.getBoundingClientRect()
    if (
        point.x < rect.left
        || point.x > rect.right
        || point.y < rect.top
        || point.y > rect.bottom
    ) {
        return null
    }

    const viewportSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    }

    if (store.viewMode === 'full') {
        return {
            paneId: null,
            targetIndex: null,
            placement: null,
            viewportSize,
        }
    }

    const localPoint = {
        x: point.x - rect.left,
        y: point.y - rect.top,
    }
    const alreadyOpenPane = store.splitView.panes.find((pane) => pane.nodeId === primitive.nodeId && pane.type === primitive.nodeType) || null
    const isReordering = isSplitPaneDrag(primitive)
    const canPlaceAtEdge = store.splitView.panes.length < SPLIT_VIEW_MAX_PANES || !!alreadyOpenPane || isReordering
    const intent = resolveSplitDropIntent({
        point: localPoint,
        panes: store.splitView.panes,
        viewportSize,
        rows: store.splitView.rows,
        rowWeights: store.splitView.rowWeights,
        columnWeights: store.splitView.columnWeights,
        canPlaceAtEdge,
    })
    if (!intent) {
        return null
    }

    return {
        paneId: intent.paneId,
        targetIndex: intent.targetIndex,
        placement: intent.placement,
        viewportSize,
    }
}

export function handleSplitViewNodeDrop(
    event: DragEndEvent,
    store: StudioState,
    primitive: DragPrimitive,
    showDropWarning: (message: string) => void,
) {
    if (!isSplitViewNodeDrag(primitive) || (store.viewMode !== 'full' && store.viewMode !== 'split')) {
        return false
    }

    const dropPoint = resolveSplitDropPoint(event, store, primitive)
    if (!dropPoint) {
        return false
    }

    const alreadyOpenPane = store.viewMode === 'split'
        ? store.splitView.panes.find((pane) => pane.nodeId === primitive.nodeId && pane.type === primitive.nodeType) || null
        : null

    if (store.viewMode === 'full') {
        const currentTarget = resolveFocusTarget(store.focusSnapshot)
        if (currentTarget && currentTarget.id === primitive.nodeId && currentTarget.type === primitive.nodeType) {
            return true
        }
        store.addSplitViewPane(primitive.nodeId, primitive.nodeType, dropPoint.viewportSize)
        return true
    }

    if (isSplitPaneDrag(primitive)) {
        if (dropPoint.targetIndex === null) {
            store.setSplitViewActivePane(primitive.nodeId, primitive.nodeType)
            return true
        }

        if (!dropPoint.placement) {
            return true
        }
        store.moveSplitViewPane(primitive.paneId, dropPoint.placement, dropPoint.viewportSize)
        return true
    }

    if (dropPoint.targetIndex !== null) {
        if (alreadyOpenPane) {
            if (!dropPoint.placement) {
                return true
            }
            store.moveSplitViewPane(alreadyOpenPane.paneId, dropPoint.placement, dropPoint.viewportSize)
            return true
        }

        if (store.splitView.panes.length < SPLIT_VIEW_MAX_PANES) {
            store.insertSplitViewPane(primitive.nodeId, primitive.nodeType, dropPoint.placement || dropPoint.targetIndex, dropPoint.viewportSize)
            return true
        }

        if (dropPoint.paneId) {
            store.replaceSplitViewPane(dropPoint.paneId, primitive.nodeId, primitive.nodeType, dropPoint.viewportSize)
            return true
        }

        showDropWarning(`Split View supports up to ${SPLIT_VIEW_MAX_PANES} panes.`)
        return true
    }

    if (alreadyOpenPane) {
        store.setSplitViewActivePane(primitive.nodeId, primitive.nodeType)
        return true
    }

    if (store.splitView.panes.length >= SPLIT_VIEW_MAX_PANES) {
        showDropWarning(`Split View supports up to ${SPLIT_VIEW_MAX_PANES} panes. Drop onto an existing slot to replace it.`)
        return true
    }

    store.addSplitViewPane(primitive.nodeId, primitive.nodeType, dropPoint.viewportSize)
    return true
}
