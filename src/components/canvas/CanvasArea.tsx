import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { ReactFlow, Background, ConnectionMode } from '@xyflow/react';
import type { Node, NodeTypes, ReactFlowInstance } from '@xyflow/react';
import { useDroppable } from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../../store';
import { resolveAgentRuntimeConfig } from '../../lib/agents';
import { usePreventBrowserZoom } from '../../hooks/usePreventBrowserZoom';
import CanvasDropOverlay from './CanvasDropOverlay';
import { getCanvasDropLabel } from './canvas-drop-label';
import { useCanvasFlowHandlers } from './useCanvasFlowHandlers';
import { useCanvasTransformTarget } from './useCanvasTransformTarget';
import { useCanvasFocusFit } from './useCanvasFocusFit';
import { useCanvasPresentation } from './useCanvasPresentation';
import { resolveFocusNodeId, syncFocusViewport } from '../../lib/focus-utils';
import { buildSyncFullscreenViewportState } from '../../store/workspace/focus-mode-state';
import { isSplitViewNodeDrag } from '../../lib/dnd-handlers';
import OffsetBezierEdge from './OffsetBezierEdge';
import SplitViewDropOverlay from './SplitViewDropOverlay';
import SplitViewResizeOverlay from './SplitViewResizeOverlay';

const AgentFrame = lazy(() =>
    import('../../features/agent').then((module) => ({ default: module.AgentFrame })),
);
const MarkdownEditorFrame = lazy(() => import('../../features/packages/MarkdownEditorFrame'));
const CanvasTerminalFrame = lazy(() => import('../../features/workspace/CanvasTerminalFrame'));
const TeamFrame = lazy(() => import('../../features/team/TeamFrame'));

const withCanvasNodeSuspense = <TProps extends object>(Component: ComponentType<TProps>) => (props: TProps) => (
    <Suspense fallback={null}>
        <Component {...props} />
    </Suspense>
);

const nodeTypes = {
    agent: withCanvasNodeSuspense(AgentFrame),
    markdownEditor: withCanvasNodeSuspense(MarkdownEditorFrame),
    canvasTerminal: withCanvasNodeSuspense(CanvasTerminalFrame),
    team: withCanvasNodeSuspense(TeamFrame),
} satisfies NodeTypes;

const edgeTypes = {
    offsetBezier: OffsetBezierEdge,
};

export default function CanvasArea() {
    const {
        agents,
        markdownEditors,
        canvasTerminals,
        drafts,
        workingDir,
        focusSnapshot,
        viewMode,
        splitView,
        canvasRevealTarget,
        selectedMarkdownEditorId,
        editingTarget,
        updateAgentPosition,
        updateAgentSize,
        updateMarkdownEditorPosition,
        updateMarkdownEditorSize,
        updateCanvasTerminalPosition,
        updateCanvasTerminalSize,
        updateCanvasTerminalSession,
        removeCanvasTerminal,
        selectedAgentId,
        selectMarkdownEditor,
        selectAgent,
        setActiveChatAgent,
        closeEditor,
        closeTeamEditor,
        openTeamEditor,
        setCanvasCenter,
        teams,
        teamEditorState,
        selectedTeamId,
        selectTeam,
        openTeamRelationEditor,
        updateTeamPosition,
        updateTeamSize,
        attachAgentToTeam,
        addRelation,
    } = useStudioStore(useShallow((state) => ({
        agents: state.agents,
        markdownEditors: state.markdownEditors,
        canvasTerminals: state.canvasTerminals,
        drafts: state.drafts,
        workingDir: state.workingDir,
        focusSnapshot: state.focusSnapshot,
        viewMode: state.viewMode,
        splitView: state.splitView,
        canvasRevealTarget: state.canvasRevealTarget,
        selectedMarkdownEditorId: state.selectedMarkdownEditorId,
        editingTarget: state.editingTarget,
        updateAgentPosition: state.updateAgentPosition,
        updateAgentSize: state.updateAgentSize,
        updateMarkdownEditorPosition: state.updateMarkdownEditorPosition,
        updateMarkdownEditorSize: state.updateMarkdownEditorSize,
        updateCanvasTerminalPosition: state.updateCanvasTerminalPosition,
        updateCanvasTerminalSize: state.updateCanvasTerminalSize,
        updateCanvasTerminalSession: state.updateCanvasTerminalSession,
        removeCanvasTerminal: state.removeCanvasTerminal,
        selectedAgentId: state.selectedAgentId,
        selectMarkdownEditor: state.selectMarkdownEditor,
        selectAgent: state.selectAgent,
        setActiveChatAgent: state.setActiveChatAgent,
        closeEditor: state.closeEditor,
        closeTeamEditor: state.closeTeamEditor,
        openTeamEditor: state.openTeamEditor,
        setCanvasCenter: state.setCanvasCenter,
        teams: state.teams,
        teamEditorState: state.teamEditorState,
        selectedTeamId: state.selectedTeamId,
        selectTeam: state.selectTeam,
        openTeamRelationEditor: state.openTeamRelationEditor,
        updateTeamPosition: state.updateTeamPosition,
        updateTeamSize: state.updateTeamSize,
        attachAgentToTeam: state.attachAgentToTeam,
        addRelation: state.addRelation,
    })));
    const isFullscreenActive = viewMode !== 'canvas';
    const focusedAgentId = viewMode === 'full' && focusSnapshot?.type === 'agent' ? focusSnapshot.nodeId : null;
    const showFullEmptyState = viewMode === 'full' && !focusSnapshot;
    const showSplitEmptyState = viewMode === 'split' && splitView.panes.length === 0;
    const splitLayoutKey = useMemo(() => JSON.stringify({
        panes: splitView.panes.map((pane) => pane.paneId),
        rows: splitView.rows,
        rowWeights: splitView.rowWeights,
        columnWeights: splitView.columnWeights,
    }), [splitView.columnWeights, splitView.panes, splitView.rowWeights, splitView.rows]);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<Node> | null>(null);
    const [flowViewportSize, setFlowViewportSize] = useState<{ width: number; height: number } | null>(null);
    const { active, isOver: isCanvasDropOver, setNodeRef: setCanvasDropRef } = useDroppable({
        id: 'canvas-root-dropzone',
        data: {
            type: 'canvas-root',
        },
    });
    const isSplitViewNodeDragging = isSplitViewNodeDrag(active?.data?.current as Parameters<typeof isSplitViewNodeDrag>[0]);

    // Prevent Ctrl+wheel / pinch-to-zoom from zooming the browser viewport.
    // Only the canvas should respond to zoom gestures.
    const canvasAreaRef = useRef<HTMLDivElement | null>(null);
    const flowShellRef = useRef<HTMLDivElement | null>(null);
    usePreventBrowserZoom(canvasAreaRef);
    const setCanvasAreaRef = useCallback((node: HTMLDivElement | null) => {
        canvasAreaRef.current = node;
    }, []);
    const setFlowShellRefs = useCallback((node: HTMLDivElement | null) => {
        flowShellRef.current = node;
        setCanvasDropRef(node);
    }, [setCanvasDropRef]);

    const {
        transformTarget,
        clearTransformTarget,
        activateTransformTarget,
        deactivateTransformTarget,
    } = useCanvasTransformTarget({
        teams,
        agents,
        markdownEditors,
        canvasTerminals,
    })

    const agentMcpSummary = useCallback((agent: typeof agents[number]) => {
        const count = resolveAgentRuntimeConfig(agent).mcpServerNames.length
        return count ? `${count} server${count === 1 ? '' : 's'}` : null
    }, [])
    const {
        nodes,
        onNodesChange,
        edges: relationEdges,
    } = useCanvasPresentation({
        teams,
        agents,
        markdownEditors,
        canvasTerminals,
        drafts,
        workingDir,
        editingTeamId: teamEditorState?.teamId || null,
        selectedTeamId,
        selectedAgentId,
        selectedMarkdownEditorId,
        focusedAgentId,
        viewMode,
        editingTarget,
        transformTarget,
        agentMcpSummary,
        onActivateTransform: activateTransformTarget,
        onDeactivateTransform: deactivateTransformTarget,
        onCloseTerminal: removeCanvasTerminal,
        onResizeTerminal: updateCanvasTerminalSize,
        onSessionChange: updateCanvasTerminalSession,
    })

    useCanvasFocusFit({
        focusSnapshot,
        canvasRevealTarget,
        reactFlowInstance,
        nodeCount: nodes.length,
        viewMode,
    })

    useEffect(() => {
        if (!focusSnapshot || !flowShellRef.current) {
            return
        }

        const focusNodeId = resolveFocusNodeId(focusSnapshot)
        if (!focusNodeId) {
            return
        }

        const canvasElement = flowShellRef.current
        let frameId = 0

        const syncFocusedNodeSize = () => {
            frameId = 0
            const width = Math.round(canvasElement.clientWidth)
            const height = Math.round(canvasElement.clientHeight)

            if (!width || !height) {
                return
            }

            useStudioStore.setState((state) => {
                const patch = buildSyncFullscreenViewportState(state, { width, height })
                return patch || {}
            })

            if (reactFlowInstance) {
                syncFocusViewport(reactFlowInstance)
            }
        }

        const scheduleSync = () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId)
            }
            frameId = window.requestAnimationFrame(syncFocusedNodeSize)
        }

        scheduleSync()
        const observer = new ResizeObserver(scheduleSync)
        observer.observe(canvasElement)

        return () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId)
            }
            observer.disconnect()
        }
    }, [focusSnapshot, reactFlowInstance, splitLayoutKey, viewMode])

    const {
        onEdgeClick,
        onNodeDragStop,
        onNodeClick,
        onPaneClick,
        onConnect,
        handleNodesChange,
        onMoveEnd,
        syncCanvasCenter,
    } = useCanvasFlowHandlers({
        nodes,
        editingTeamId: teamEditorState?.teamId || null,
        editingTarget,
        reactFlowInstance,
        canvasAreaRef: flowShellRef,
        transformTarget,
        clearTransformTarget,
        closeEditor,
        closeTeamEditor,
        openTeamEditor,
        openTeamRelationEditor,
        setCanvasCenter,
        selectMarkdownEditor,
        selectAgent,
        setActiveChatAgent,
        selectTeam,
        attachAgentToTeam,
        addRelation,
        onNodesChange,
        updateMarkdownEditorPosition,
        updateCanvasTerminalPosition,
        updateTeamPosition,
        updateAgentPosition,
        updateTeamSize,
        updateMarkdownEditorSize,
        updateCanvasTerminalSize,
        updateAgentSize,
    })

    useEffect(() => {
        if (!reactFlowInstance || !flowShellRef.current) {
            return
        }

        let frameId = window.requestAnimationFrame(() => {
            frameId = 0
            syncCanvasCenter()
        })

        const observer = new ResizeObserver(() => {
            if (frameId) {
                window.cancelAnimationFrame(frameId)
            }
            frameId = window.requestAnimationFrame(() => {
                frameId = 0
                syncCanvasCenter()
            })
        })
        observer.observe(flowShellRef.current)

        return () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId)
            }
            observer.disconnect()
        }
    }, [reactFlowInstance, nodes.length, syncCanvasCenter])

    useEffect(() => {
        const element = flowShellRef.current
        if (!element) {
            return
        }

        const syncSize = () => {
            setFlowViewportSize({
                width: Math.round(element.clientWidth),
                height: Math.round(element.clientHeight),
            })
        }

        syncSize()
        const observer = new ResizeObserver(syncSize)
        observer.observe(element)

        return () => {
            observer.disconnect()
        }
    }, [])

    const canvasDropLabel = getCanvasDropLabel(active?.data?.current?.kind)

    return (
        <div className={`canvas-area ${isFullscreenActive ? 'canvas-area--focus' : ''}`} ref={setCanvasAreaRef}>
            <div className="canvas-flow-shell" ref={setFlowShellRefs}>
                {showFullEmptyState ? (
                    <div className="canvas-fullscreen-empty-state">
                        <div className="canvas-fullscreen-empty-state__copy">
                            Select a Team or Agent from the left sidebar
                        </div>
                    </div>
                ) : null}
                {showSplitEmptyState ? (
                    <div className="canvas-fullscreen-empty-state">
                        <div className="canvas-fullscreen-empty-state__copy">
                            Drag a Team or Agent here from the left sidebar
                        </div>
                    </div>
                ) : null}
                <CanvasDropOverlay active={isCanvasDropOver && !isSplitViewNodeDragging} label={canvasDropLabel} />
                <SplitViewDropOverlay
                    active={active}
                    viewMode={viewMode}
                    splitView={splitView}
                    viewportSize={flowViewportSize}
                    teams={teams}
                    agents={agents}
                />
                <SplitViewResizeOverlay
                    viewMode={viewMode}
                    splitView={splitView}
                    viewportSize={flowViewportSize}
                />
                <ReactFlow
                    nodes={nodes}
                    edges={relationEdges}
                    onInit={setReactFlowInstance}
                    onNodesChange={handleNodesChange}
                    onNodeDragStop={onNodeDragStop}
                    onNodeClick={onNodeClick}
                    onConnect={onConnect}
                    isValidConnection={() => true}
                    connectionMode={ConnectionMode.Loose}
                    onEdgeClick={onEdgeClick}
                    onPaneClick={onPaneClick}
                    onMoveEnd={onMoveEnd}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    multiSelectionKeyCode={null}
                    selectionKeyCode={null}
                    proOptions={{ hideAttribution: true }}
                    fitView
                    fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
                    panOnDrag={!isFullscreenActive}
                    zoomOnScroll={!isFullscreenActive}
                    zoomOnPinch={!isFullscreenActive}
                    zoomOnDoubleClick={!isFullscreenActive}
                    nodesDraggable={!isFullscreenActive}
                >
                    <Background color={isFullscreenActive ? 'transparent' : 'var(--border-strong)'} gap={16} size={1} />
                </ReactFlow>
            </div>
        </div>
    );
}
