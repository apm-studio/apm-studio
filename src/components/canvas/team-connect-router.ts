import type { Connection, Node } from '@xyflow/react'

type ConnectRouterArgs = {
    currentTeamId: string | null
    connection: Connection
    nodes: Node[]
    onConnectAgentsInTeam: (teamId: string, agentIds: [string, string]) => void
}

export function routeTeamConnection(args: ConnectRouterArgs) {
    const {
        currentTeamId,
        connection,
        nodes,
        onConnectAgentsInTeam,
    } = args

    if (!currentTeamId || !connection.source || !connection.target || connection.source === connection.target) {
        return false
    }

    const sourceNode = nodes.find((node) => node.id === connection.source)
    const targetNode = nodes.find((node) => node.id === connection.target)

    if (sourceNode?.type === 'agent' && targetNode?.type === 'agent') {
        onConnectAgentsInTeam(currentTeamId, [connection.source, connection.target])
        return true
    }

    return false
}
