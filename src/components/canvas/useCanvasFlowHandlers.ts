import type {
    WorkspaceAgentNode,
    WorkspaceTeamParticipantBinding,
} from '../../../shared/workspace-contracts'
import { useCallback } from 'react'
import type { Connection, Node, NodeChange, ReactFlowInstance } from '@xyflow/react'
import type { WorkspaceSlice } from '../../store/workspace/types'
import { useStudioStore } from '../../store'
import { resolveCanvasCenterPosition } from '../../store/workspace/helpers'
import { routeTeamConnection } from './team-connect-router'
import {
    resolveCanvasDragStop,
    resolveCanvasEdgeClick,
    resolveCanvasNodeClick,
} from './canvas-event-router'
import { resolveCanvasResizeChange } from './canvas-resize-router'

type EditingTargetLike = WorkspaceSlice['editingTarget']
type CanvasNodeKind = 'agent' | 'markdownEditor' | 'canvasTerminal' | 'team'

type UseCanvasFlowHandlersArgs = {
    nodes: Node[]
    editingTeamId: string | null
    editingTarget: EditingTargetLike
    reactFlowInstance: ReactFlowInstance<Node> | null
    canvasAreaRef: React.RefObject<HTMLDivElement | null>
    transformTarget: { id: string; type: CanvasNodeKind } | null
    clearTransformTarget: () => void
    closeEditor: () => void
    closeTeamEditor: () => void
    openTeamEditor: (teamId: string, mode?: 'team' | 'participant' | 'relation', options?: { participantKey?: string | null; relationId?: string | null }) => void
    openTeamRelationEditor: (teamId: string, relationId: string) => void
    setCanvasCenter: (x: number, y: number) => void
    selectMarkdownEditor: (id: string | null) => void
    selectAgent: (id: string | null) => void
    setActiveChatAgent: (id: string | null) => void
    selectTeam: (id: string | null) => void
    attachAgentToTeam: (teamId: string, agentId: string) => string | null
    addRelation: (teamId: string, between: [string, string], direction: 'both' | 'one-way') => string | null
    onNodesChange: (changes: NodeChange<Node>[]) => void
    updateMarkdownEditorPosition: (id: string, x: number, y: number) => void
    updateCanvasTerminalPosition: (id: string, x: number, y: number) => void
    updateTeamPosition: (id: string, x: number, y: number) => void
    updateAgentPosition: (id: string, x: number, y: number) => void
    updateTeamSize: (id: string, width: number, height: number) => void
    updateMarkdownEditorSize: (id: string, width: number, height: number) => void
    updateCanvasTerminalSize: (id: string, width: number, height: number) => void
    updateAgentSize: (id: string, width: number, height: number) => void
}

export function useCanvasFlowHandlers(args: UseCanvasFlowHandlersArgs) {
    const {
        nodes,
        editingTeamId,
        editingTarget,
        reactFlowInstance,
        canvasAreaRef,
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
    } = args

    const onEdgeClick = useCallback((_event: React.MouseEvent, edge: import('@xyflow/react').Edge) => {
        if (!editingTeamId) return
        const relationId = resolveCanvasEdgeClick(edge)
        if (!relationId) return
        openTeamRelationEditor(editingTeamId, relationId)
    }, [editingTeamId, openTeamRelationEditor])

    const onNodeDragStop = useCallback((_: unknown, node: Node) => {
        const result = resolveCanvasDragStop(node)

        switch (result.kind) {
            case 'markdownEditor':
                updateMarkdownEditorPosition(result.id, result.x, result.y)
                return
            case 'canvasTerminal':
                updateCanvasTerminalPosition(result.id, result.x, result.y)
                return
            case 'team':
                updateTeamPosition(result.id, result.x, result.y)
                return
            case 'agent':
                updateAgentPosition(result.id, result.x, result.y)
                return
        }
    }, [
        updateMarkdownEditorPosition,
        updateCanvasTerminalPosition,
        updateTeamPosition,
        updateAgentPosition,
    ])

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        const result = resolveCanvasNodeClick(node, event.target, editingTarget)
        if (result.kind === 'ignore') {
            return
        }

        clearTransformTarget()

        switch (result.kind) {
            case 'markdownEditor':
                closeEditor()
                // Keep Team edit mode active when focusing other canvas elements.
                if (!editingTeamId) {
                    closeTeamEditor()
                }
                selectMarkdownEditor(result.id)
                return
            case 'canvasTerminal':
                closeEditor()
                // Keep Team edit mode active when focusing other canvas elements.
                if (!editingTeamId) {
                    closeTeamEditor()
                }
                selectAgent(null)
                selectMarkdownEditor(null)
                return
            case 'team':
                closeEditor()
                selectAgent(null)
                selectMarkdownEditor(null)
                selectTeam(result.id)
                useStudioStore.getState().setSplitViewActivePane(result.id, 'team')
                return
            case 'agent':
                if (editingTeamId) {
                    // Stay in Team edit mode - just refocus the Team.
                    closeEditor()
                    selectTeam(editingTeamId)
                    return
                }
                if (result.shouldCloseEditor) {
                    closeEditor()
                }
                closeTeamEditor()
                selectAgent(result.id)
                setActiveChatAgent(result.id)
                useStudioStore.getState().setSplitViewActivePane(result.id, 'agent')
                return
        }
    }, [
        editingTarget,
        editingTeamId,
        clearTransformTarget,
        closeEditor,
        closeTeamEditor,
        selectMarkdownEditor,
        selectAgent,
        selectTeam,
        setActiveChatAgent,
    ])

    const onPaneClick = useCallback(() => {
        clearTransformTarget()
        closeEditor()
        // Keep Team edit mode until the user takes an explicit close action.
        if (!editingTeamId) {
            closeTeamEditor()
            selectTeam(null)
        }
        selectAgent(null)
        selectMarkdownEditor(null)
    }, [
        clearTransformTarget,
        closeEditor,
        editingTeamId,
        closeTeamEditor,
        selectAgent,
        selectMarkdownEditor,
        selectTeam,
    ])

    const onConnect = useCallback((connection: Connection) => {
        routeTeamConnection({
            currentTeamId: editingTeamId,
            connection,
            nodes,
            onConnectAgentsInTeam: (teamId, agentIds) => {
                // Check if at least one agent is already bound, unless Team has no participants
                const state = useStudioStore.getState()
                const team = state.teams.find((a) => a.id === teamId)
                const participantCount = team ? Object.keys(team.participants).length : 0

                if (participantCount > 0) {
                    const isAgentBound = (agentId: string) => {
                        const agent = state.agents.find((p: WorkspaceAgentNode) => p.id === agentId)
                        const derivedFrom = agent?.meta?.derivedFrom?.trim()
                        return team && Object.values(team.participants).some((binding: WorkspaceTeamParticipantBinding) => {
                            const ref = binding.agentRef
                            return (ref.kind === 'draft' && ref.draftId === agentId)
                                || (ref.kind === 'registry' && !!derivedFrom && ref.urn === derivedFrom)
                        })
                    }
                    if (!isAgentBound(agentIds[0]) && !isAgentBound(agentIds[1])) {
                        // Both agents are unbound — block the connection
                        return
                    }
                }

                const sourceKey = attachAgentToTeam(teamId, agentIds[0])
                const targetKey = attachAgentToTeam(teamId, agentIds[1])
                if (!sourceKey || !targetKey || sourceKey === targetKey) {
                    return
                }
                addRelation(teamId, [sourceKey, targetKey], 'one-way')
                openTeamEditor(teamId, 'team')
            },
        })
    }, [
        editingTeamId,
        nodes,
        attachAgentToTeam,
        addRelation,
        openTeamEditor,
    ])

    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        const filtered = changes.filter((change) => change.type !== 'select')
        onNodesChange(filtered)

        changes.forEach((change) => {
            const resizeResult = resolveCanvasResizeChange(change, nodes)
            if (!resizeResult) return

            const ownsResize = (
                'id' in resizeResult && !!transformTarget && transformTarget.id === resizeResult.id && transformTarget.type === resizeResult.kind
            )
            if (!ownsResize) return

            switch (resizeResult.kind) {
                case 'markdownEditor':
                    updateMarkdownEditorSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
                case 'canvasTerminal':
                    updateCanvasTerminalSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
                case 'team':
                    updateTeamSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
                case 'agent':
                    updateAgentSize(resizeResult.id, resizeResult.width, resizeResult.height)
                    return
            }
        })
    }, [
        onNodesChange,
        nodes,
        transformTarget,
        updateMarkdownEditorSize,
        updateCanvasTerminalSize,
        updateTeamSize,
        updateAgentSize,
    ])

    const syncCanvasCenter = useCallback(() => {
        if (!reactFlowInstance || !canvasAreaRef.current) {
            return
        }

        const center = resolveCanvasCenterPosition(
            canvasAreaRef.current,
            reactFlowInstance.screenToFlowPosition,
        )
        setCanvasCenter(center.x, center.y)
    }, [reactFlowInstance, canvasAreaRef, setCanvasCenter])

    const onMoveEnd = syncCanvasCenter

    return {
        onEdgeClick,
        onNodeDragStop,
        onNodeClick,
        onPaneClick,
        onConnect,
        handleNodesChange,
        onMoveEnd,
        syncCanvasCenter,
    }
}
