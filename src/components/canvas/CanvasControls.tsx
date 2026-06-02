import { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { Viewport } from '@xyflow/react'
import { Maximize, Maximize2, Minimize, ZoomIn, ZoomOut } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import { getCanvasViewportSize } from '../../lib/focus-utils'
import { shouldRenderStudioAgentTeamsUi } from '../../app/studio-agent-ui-state'

export default function CanvasControls() {
    const { fitView, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow()
    const [isFitted, setIsFitted] = useState(false)
    const prevViewport = useRef<Viewport | null>(null)

    const {
        selectedAgentId,
        selectedTeamId,
        focusSnapshot,
        viewMode,
        enterFocusMode,
        exitFocusMode,
        exitTeamLayoutMode,
    } = useStudioStore(useShallow((state) => ({
        selectedAgentId: state.selectedAgentId,
        selectedTeamId: state.selectedTeamId,
        focusSnapshot: state.focusSnapshot,
        viewMode: state.viewMode,
        enterFocusMode: state.enterFocusMode,
        exitFocusMode: state.exitFocusMode,
        exitTeamLayoutMode: state.exitTeamLayoutMode,
    })))
    const isCanvasMode = viewMode === 'canvas'
    const isFullscreenActive = viewMode !== 'canvas'
    const showTeamsUi = shouldRenderStudioAgentTeamsUi()
    const focusableTeamId = showTeamsUi ? selectedTeamId : null

    const toggleFitView = useCallback(() => {
        if (isFitted && prevViewport.current) {
            setViewport(prevViewport.current, { duration: 400 })
            setIsFitted(false)
        } else {
            prevViewport.current = getViewport()
            fitView({ duration: 400, padding: 0.1, maxZoom: 1 })
            setIsFitted(true)
        }
    }, [isFitted, fitView, getViewport, setViewport])

    const enterFocus = useCallback(() => {
        const nodeId = selectedAgentId || focusableTeamId
        const nodeType = selectedAgentId ? 'agent' as const : 'team' as const
        if (!nodeId) return

        enterFocusMode(nodeId, nodeType, getCanvasViewportSize())
    }, [selectedAgentId, focusableTeamId, enterFocusMode])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return

            // Team focus controls are parked with the rest of the Team UI until the UX is upgraded.
            if (showTeamsUi && focusSnapshot?.type === 'team') {
                exitTeamLayoutMode()
                exitFocusMode()
                return
            }

            if (isFullscreenActive) {
                exitFocusMode()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreenActive, exitFocusMode, focusSnapshot, exitTeamLayoutMode, showTeamsUi])

    return (
        <div className="canvas-controls">
            <button
                type="button"
                className="canvas-controls__btn"
                onClick={() => zoomIn({ duration: 200 })}
                aria-label="Zoom in"
                title={isCanvasMode ? 'Zoom In' : 'Zoom disabled in fullscreen views'}
                disabled={!isCanvasMode}
            >
                <ZoomIn size={14} />
            </button>
            <button
                type="button"
                className="canvas-controls__btn"
                onClick={() => zoomOut({ duration: 200 })}
                aria-label="Zoom out"
                title={isCanvasMode ? 'Zoom Out' : 'Zoom disabled in fullscreen views'}
                disabled={!isCanvasMode}
            >
                <ZoomOut size={14} />
            </button>
            {isCanvasMode && (selectedAgentId || focusableTeamId) && (
                <button
                    type="button"
                    className="canvas-controls__btn"
                    onClick={enterFocus}
                    aria-label="Focus selected"
                    title="Focus Selected"
                >
                    <Maximize2 size={14} />
                </button>
            )}
            <button
                type="button"
                className="canvas-controls__btn"
                onClick={toggleFitView}
                aria-label={isFitted ? 'Restore canvas view' : 'Fit canvas to screen'}
                title={isCanvasMode ? (isFitted ? 'Restore View' : 'Fit to Screen') : 'Fit disabled in fullscreen views'}
                disabled={!isCanvasMode}
            >
                {isFitted ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
        </div>
    )
}
