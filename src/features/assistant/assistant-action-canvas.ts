import type { AssistantStudioNodeType } from '../../../shared/assistant-actions'
import { useStudioStore } from '../../store'
import {
    collectVisibleCanvasNodeRects,
    resolveTeamCreationClusterLayout,
} from '../../lib/canvas-node-layout'
import { store, type AssistantRefState } from './assistant-action-state'

export function autoLayoutAssistantTeamCluster(
    refs: AssistantRefState,
    teamId: string,
    participantAgentIds: string[],
) {
    if (participantAgentIds.length === 0) return
    if (!participantAgentIds.every((agentId) => refs.createdAgents.has(agentId))) return

    const current = store()
    const occupiedRects = collectVisibleCanvasNodeRects(
        current.agents.filter((agent) => !participantAgentIds.includes(agent.id)),
        current.teams.filter((team) => team.id !== teamId),
    )
    const layout = resolveTeamCreationClusterLayout({
        canvasCenter: current.canvasCenter,
        occupiedRects,
        agentIds: participantAgentIds,
    })

    useStudioStore.setState((state) => ({
        agents: state.agents.map((agent) => {
            const nextPosition = layout.agentPositions.get(agent.id)
            return nextPosition
                ? { ...agent, position: nextPosition }
                : agent
        }),
        teams: state.teams.map((team) => (
            team.id === teamId
                ? { ...team, position: layout.teamPosition }
                : team
        )),
        canvasRevealTarget: {
            id: teamId,
            type: 'team',
            nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
        },
        workspaceDirty: true,
    }))
}

export function applyNodeReveal(nodeId: string, nodeType: AssistantStudioNodeType) {
    store().revealCanvasNode(nodeId, nodeType === 'agent' ? 'agent' : 'team')
}

export function applyNodeSelection(nodeId: string, nodeType: AssistantStudioNodeType) {
    if (nodeType === 'agent') {
        store().selectAgent(nodeId)
    } else {
        store().selectTeam(nodeId)
    }
}

function getNodeHidden(nodeId: string, nodeType: AssistantStudioNodeType) {
    return nodeType === 'agent'
        ? !!store().agents.find((agent) => agent.id === nodeId)?.hidden
        : !!store().teams.find((team) => team.id === nodeId)?.hidden
}

export function setNodeVisibility(nodeId: string, nodeType: AssistantStudioNodeType, visible: boolean) {
    const hidden = getNodeHidden(nodeId, nodeType)
    if (hidden === visible) {
        if (nodeType === 'agent') {
            store().toggleAgentVisibility(nodeId)
        } else {
            store().toggleTeamVisibility(nodeId)
        }
    }
}

export function setNodeFrame(
    nodeId: string,
    nodeType: AssistantStudioNodeType,
    frame: {
        position?: { x: number; y: number }
        size?: { width: number; height: number }
    },
) {
    if (nodeType === 'agent') {
        if (frame.position) store().updateAgentPosition(nodeId, frame.position.x, frame.position.y)
        if (frame.size) store().updateAgentSize(nodeId, frame.size.width, frame.size.height)
        return
    }

    if (frame.position) store().updateTeamPosition(nodeId, frame.position.x, frame.position.y)
    if (frame.size) store().updateTeamSize(nodeId, frame.size.width, frame.size.height)
}
