import type { DraftPrimitive } from '../../lib/primitive-types'
import { useCallback, useEffect, useMemo } from 'react'
import { useNodesState } from '@xyflow/react'
import type {
    Node } from '@xyflow/react'
import type { WorkspaceSlice, WorkspaceViewMode } from '../../store/workspace/types'

import type {
    WorkspaceCanvasTerminalNode,
    WorkspaceMarkdownEditorNode,
    WorkspaceAgentNode,
    WorkspaceTeamSnapshot,
} from '../../../shared/workspace-contracts'
import { composeCanvasEdges } from './canvas-edge-composer'
import { composeCanvasNodes } from './canvas-node-composer'
import {
    buildTeamCanvasNodes,
    buildCanvasTerminalWindowNodes,
    buildMarkdownEditorCanvasNodes,
    buildAgentCanvasNodes,
} from './canvas-window-node-builders'
import { shouldRenderStudioAgentTeamsUi } from '../../app/studio-agent-ui-state'

type CanvasNodeKind = 'agent' | 'markdownEditor' | 'canvasTerminal' | 'team'

type UseCanvasPresentationArgs = {
    teams: WorkspaceTeamSnapshot[]
    agents: WorkspaceAgentNode[]
    markdownEditors: WorkspaceMarkdownEditorNode[]
    canvasTerminals: WorkspaceCanvasTerminalNode[]
    drafts: Record<string, DraftPrimitive>
    workingDir: string
    editingTeamId: string | null
    selectedTeamId: string | null
    selectedAgentId: string | null
    selectedMarkdownEditorId: string | null
    focusedAgentId: string | null
    viewMode: WorkspaceViewMode
    editingTarget: WorkspaceSlice['editingTarget']
    transformTarget: { id: string; type: CanvasNodeKind } | null
    agentMcpSummary: (agent: WorkspaceAgentNode) => string | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
    onCloseTerminal: (id: string) => void
    onResizeTerminal: (id: string, width: number, height: number) => void
    onSessionChange: (id: string, sessionId: string | null, connected: boolean) => void
}

export function useCanvasPresentation(args: UseCanvasPresentationArgs) {
    const {
        teams,
        agents,
        markdownEditors,
        canvasTerminals,
        drafts,
        workingDir,
        editingTeamId,
        selectedTeamId,
        selectedAgentId,
        selectedMarkdownEditorId,
        focusedAgentId,
        viewMode,
        editingTarget,
        transformTarget,
        agentMcpSummary,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTerminal,
        onResizeTerminal,
        onSessionChange,
    } = args

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const showTeamsUi = shouldRenderStudioAgentTeamsUi()

    const buildAgentNodes = useCallback(() => buildAgentCanvasNodes({
        teams: showTeamsUi ? teams : [],
        editingTeamId: showTeamsUi ? editingTeamId : null,
        agents,
        selectedAgentId,
        focusedAgentId,
        editingTarget,
        transformTarget,
        drafts,
        agentMcpSummary,
        onActivateTransform,
        onDeactivateTransform,
    }), [
        teams,
        editingTeamId,
        agents,
        selectedAgentId,
        focusedAgentId,
        editingTarget,
        transformTarget,
        drafts,
        agentMcpSummary,
        onActivateTransform,
        onDeactivateTransform,
        showTeamsUi,
    ])

    const buildMarkdownEditorNodes = useCallback(() => buildMarkdownEditorCanvasNodes({
        markdownEditors,
        selectedMarkdownEditorId,
        transformTarget,
        workingDir,
        onActivateTransform,
        onDeactivateTransform,
    }), [
        markdownEditors,
        selectedMarkdownEditorId,
        transformTarget,
        workingDir,
        onActivateTransform,
        onDeactivateTransform,
    ])

    const buildCanvasTerminalNodes = useCallback(() => buildCanvasTerminalWindowNodes({
        canvasTerminals,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTerminal,
        onResizeTerminal,
        onSessionChange,
    }), [
        canvasTerminals,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTerminal,
        onResizeTerminal,
        onSessionChange,
    ])

    const buildTeamNodes = useCallback(() => buildTeamCanvasNodes({
        teams,
        editingTeamId,
        selectedTeamId,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
    }), [
        teams,
        editingTeamId,
        selectedTeamId,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
    ])

    useEffect(() => {
        const isCanvasMode = viewMode === 'canvas'
        // Team canvas nodes are parked while the Studio Agent Team UX is upgraded.
        // Keep the builders/codepaths intact; re-enable through studio-agent-ui-state.
        setNodes(composeCanvasNodes({
            agentNodes: buildAgentNodes(),
            markdownEditorNodes: isCanvasMode ? buildMarkdownEditorNodes() : [],
            canvasTerminalNodes: isCanvasMode ? buildCanvasTerminalNodes() : [],
            teamNodes: showTeamsUi ? buildTeamNodes() : [],
        }))
    }, [
        buildAgentNodes,
        buildMarkdownEditorNodes,
        buildCanvasTerminalNodes,
        buildTeamNodes,
        showTeamsUi,
        viewMode,
        setNodes,
    ])

    const edges = useMemo(
        () => viewMode === 'canvas' && showTeamsUi ? composeCanvasEdges(teams, editingTeamId, agents) : [],
        [teams, editingTeamId, agents, showTeamsUi, viewMode],
    )

    return {
        nodes,
        setNodes,
        onNodesChange,
        edges,
    }
}
