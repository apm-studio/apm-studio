import { useEffect, useRef } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import {
    FOCUS_EXIT_FIT,
    FOCUS_VIEWPORT_SYNC_DELAY,
    resolveFocusNodeId,
    revealCanvasNodeWithoutZoom,
    syncFocusViewport,
} from '../../lib/focus-utils'
import type { CanvasRevealTarget, FocusSnapshot, WorkspaceViewMode } from '../../store/workspace/types'

export function useCanvasFocusFit(args: {
    focusSnapshot: FocusSnapshot | null
    canvasRevealTarget: CanvasRevealTarget | null
    reactFlowInstance: ReactFlowInstance<Node> | null
    nodeCount: number
    viewMode: WorkspaceViewMode
}) {
    const { focusSnapshot, canvasRevealTarget, reactFlowInstance, nodeCount, viewMode } = args
    const wasFocusActiveRef = useRef(false)
    const previousViewModeRef = useRef<WorkspaceViewMode>(viewMode)

    useEffect(() => {
        if (!reactFlowInstance) {
            wasFocusActiveRef.current = !!focusSnapshot
            return
        }

        const isFocusActive = !!focusSnapshot
        const focusNodeId = resolveFocusNodeId(focusSnapshot)
        const wasFocusActive = wasFocusActiveRef.current
        const previousViewMode = previousViewModeRef.current

        const timer = window.setTimeout(() => {
            if (isFocusActive && focusNodeId) {
                syncFocusViewport(reactFlowInstance)
                return
            }

            if (wasFocusActive) {
                reactFlowInstance.fitView({
                    ...FOCUS_EXIT_FIT,
                    duration: previousViewMode === 'full' ? 0 : FOCUS_EXIT_FIT.duration,
                })
                return
            }

            if (canvasRevealTarget?.id) {
                revealCanvasNodeWithoutZoom(reactFlowInstance, canvasRevealTarget.id)
            }
        }, FOCUS_VIEWPORT_SYNC_DELAY)

        wasFocusActiveRef.current = isFocusActive
        previousViewModeRef.current = viewMode

        return () => {
            window.clearTimeout(timer)
        }
    }, [focusSnapshot, canvasRevealTarget?.id, canvasRevealTarget?.nonce, reactFlowInstance, nodeCount, viewMode])
}
