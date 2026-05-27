/**
 * ActFrame — runtime-first Act canvas window with explicit edit mode.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Workflow } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import {
    ACT_DEFAULT_WIDTH,
    ACT_MIN_EXPANDED_HEIGHT,
    resolveActExpandedHeight,
} from '../../lib/act-layout'
import { resolveActThreadOrdinal, resolveDisplayedActThread } from '../../lib/act-threads'
import ActHeaderActions from './ActHeaderActions'
import ActSurfacePanel from './ActSurfacePanel'
import { getCanvasViewportSize, isFocusTarget, isSplitViewTarget } from '../../lib/focus-utils'
import { evaluateActReadiness } from './act-readiness'
import './ActFrame.css'

const EMPTY_THREADS: never[] = []

type ActFrameData = {
    width?: number
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
}

export default function ActFrame({ data, id }: NodeProps<Node<ActFrameData, 'act'>>) {
    const {
        acts,
        performers,
        selectedActId,
        actEditorState,
        selectAct,
        openActEditor,
        closeActEditor,
        toggleActVisibility,
        activeThreadId,
        actThreads,
        focusSnapshot,
        viewMode,
        workspaceMode,
        splitView,
        enterFocusMode,
        exitFocusMode,
        removeSplitViewPane,
    } = useStudioStore(useShallow((state) => ({
        acts: state.acts,
        performers: state.performers,
        selectedActId: state.selectedActId,
        actEditorState: state.actEditorState,
        selectAct: state.selectAct,
        openActEditor: state.openActEditor,
        closeActEditor: state.closeActEditor,
        toggleActVisibility: state.toggleActVisibility,
        activeThreadId: state.activeThreadId,
        actThreads: state.actThreads,
        focusSnapshot: state.focusSnapshot,
        viewMode: state.viewMode,
        workspaceMode: state.workspaceMode,
        splitView: state.splitView,
        enterFocusMode: state.enterFocusMode,
        exitFocusMode: state.exitFocusMode,
        removeSplitViewPane: state.removeSplitViewPane,
    })))
    const bodyRef = useRef<HTMLDivElement>(null)

    const act = useMemo(() => acts.find((a) => a.id === id), [acts, id])
    const readiness = useMemo(
        () => act ? evaluateActReadiness(act, performers) : { runnable: false, issues: [] },
        [act, performers],
    )

    const isSelected = selectedActId === id
    const isFocused = viewMode === 'full' && isFocusTarget(focusSnapshot, id, 'act')
    const splitPane = splitView.panes.find((pane) => pane.type === 'act' && pane.nodeId === id) || null
    const isSplitPane = isSplitViewTarget(viewMode, splitView, id, 'act')
    const isFullscreenSurface = isFocused || isSplitPane
    const isManageMode = workspaceMode === 'manage' && !isFullscreenSurface
    const isExplicitEditing = actEditorState?.actId === id
    const isEditing = isManageMode || isExplicitEditing
    const width = data.width || act?.width || ACT_DEFAULT_WIDTH
    const height = resolveActExpandedHeight(act?.height)
    const threads = useMemo(() => actThreads[id] || EMPTY_THREADS, [actThreads, id])
    const displayedThread = useMemo(
        () => resolveDisplayedActThread(threads, activeThreadId),
        [activeThreadId, threads],
    )
    const displayedThreadOrdinal = useMemo(
        () => resolveActThreadOrdinal(threads, displayedThread?.id || null),
        [displayedThread?.id, threads],
    )

    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        const handler = (event: WheelEvent) => { event.stopPropagation() }
        el.addEventListener('wheel', handler, { passive: true })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    const handleSelectAct = () => selectAct(id)
    const handleToggleEdit = () => {
        if (isManageMode) return
        if (isExplicitEditing) {
            closeActEditor()
            return
        }
        openActEditor(id, 'act')
    }
    const handleToggleFocus = useCallback(() => {
        if (workspaceMode === 'run' && isFocused) return
        if (isFocused) {
            exitFocusMode()
            return
        }

        enterFocusMode(id, 'act', getCanvasViewportSize())
    }, [enterFocusMode, exitFocusMode, id, isFocused, workspaceMode])
    const handleRemoveSplitPane = useCallback(() => {
        if (!splitPane) return
        removeSplitViewPane(splitPane.paneId, getCanvasViewportSize())
    }, [removeSplitViewPane, splitPane])

    if (!act) {
        return null
    }

    return (
        <div className="act-frame-shell">
            <CanvasWindowFrame
                className={`act-frame nowheel ${isSelected ? 'act-frame--selected' : ''} ${isEditing ? 'act-frame--editing' : ''} ${isFocused ? 'canvas-frame--focused' : ''} ${isSplitPane ? 'canvas-frame--split-pane' : ''} act-frame--chat`}
                width={width}
                height={height}
                focused={isFocused}
                locked={isFullscreenSurface}
                dragHandle={splitPane ? {
                    id: `split-pane-frame:${splitPane.paneId}`,
                    data: {
                        kind: 'act',
                        source: 'split-pane',
                        paneId: splitPane.paneId,
                        nodeId: id,
                        nodeType: 'act',
                        label: act.name,
                        name: act.name,
                    },
                    title: 'Move Split View pane',
                } : undefined}
                minWidth={ACT_DEFAULT_WIDTH}
                minHeight={ACT_MIN_EXPANDED_HEIGHT}
                transformActive={data.transformActive || false}
                onActivateTransform={data.onActivateTransform}
                onDeactivateTransform={data.onDeactivateTransform}
                selected={isSelected}
                headerStart={
                    <div className="act-frame__title" onClick={handleSelectAct}>
                        <Workflow size={12} className="act-frame__icon" />
                        <span className="act-frame__name">{act.name}</span>
                        {displayedThreadOrdinal ? (
                            <span className="act-frame__thread-chip">
                                #{displayedThreadOrdinal}
                            </span>
                        ) : null}
                    </div>
                }
                headerEnd={(
                    <ActHeaderActions
                        focused={isFocused}
                        splitPane={isSplitPane}
                        editing={isEditing}
                        hideFocusControl={isManageMode || (workspaceMode === 'run' && isFocused)}
                        hideEditControl={isManageMode}
                        readiness={readiness}
                        onToggleFocus={handleToggleFocus}
                        onRemoveSplitPane={handleRemoveSplitPane}
                        onToggleEdit={handleToggleEdit}
                        onHide={() => toggleActVisibility(id)}
                    />
                )}
                bodyClassName="nowheel nodrag"
                bodyRef={bodyRef}
            >
                <ActSurfacePanel actId={id} />
            </CanvasWindowFrame>
        </div>
    )
}
