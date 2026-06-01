import type {
    SavedWorkspaceSnapshot,
    WorkspaceAgentNode,
    WorkspaceAgentSnapshot,
    WorkspaceSnapshot,
} from '../../../shared/workspace-contracts.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isWorkspaceAgentSnapshot(agent: unknown): agent is WorkspaceAgentSnapshot {
    return (
        isRecord(agent)
        && typeof agent.id === 'string'
        && agent.id.length > 0
        && typeof agent.name === 'string'
    )
}

export function workspaceAgentNodeFromSnapshot(
    agent: WorkspaceAgentSnapshot,
    fallback?: WorkspaceAgentNode,
): WorkspaceAgentNode {
    return {
        ...fallback,
        ...agent,
        id: agent.id,
        name: agent.name,
        position: agent.position || fallback?.position || { x: 0, y: 0 },
        scope: agent.scope || fallback?.scope || 'shared',
        model: agent.model ?? null,
        skillRefs: agent.skillRefs || [],
        mcpServerNames: agent.mcpServerNames || [],
    }
}

export function mergeApmWorkspaceIntoSavedSnapshot(
    workspace: SavedWorkspaceSnapshot,
    apmWorkspace: WorkspaceSnapshot,
    workingDir: string,
): SavedWorkspaceSnapshot {
    const savedAgentsById = new Map(workspace.agents.map((agent) => [agent.id, agent]))
    const mergedAgents = (apmWorkspace.agents || workspace.agents)
        .filter(isWorkspaceAgentSnapshot)
        .map((agent) => workspaceAgentNodeFromSnapshot(agent, savedAgentsById.get(agent.id)))

    return {
        ...workspace,
        ...apmWorkspace,
        schemaVersion: 1,
        workingDir,
        hiddenFromList: workspace.hiddenFromList ?? apmWorkspace.hiddenFromList,
        agents: mergedAgents,
        markdownEditors: apmWorkspace.markdownEditors || workspace.markdownEditors || [],
    }
}
