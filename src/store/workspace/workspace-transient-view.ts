import type { StudioState } from '../types'

function snapshotRectMap(state: StudioState) {
    const snapshot = state.focusSnapshot
    const rects = new Map<string, { position: { x: number; y: number }; width: number; height: number }>()
    if (!snapshot) return rects

    for (const rect of snapshot.nodeRects || []) {
        rects.set(`${rect.type}:${rect.nodeId}`, {
            position: rect.nodePosition,
            width: rect.nodeSize.width,
            height: rect.nodeSize.height,
        })
    }

    if (snapshot.nodePosition) {
        rects.set(`${snapshot.type}:${snapshot.nodeId}`, {
            position: snapshot.nodePosition,
            width: snapshot.nodeSize.width,
            height: snapshot.nodeSize.height,
        })
    }

    return rects
}

export function restoreTransientViewAgents(state: StudioState) {
    const snapshot = state.focusSnapshot
    if (!snapshot) return state.agents
    const rects = snapshotRectMap(state)

    return state.agents.map((agent) => ({
        ...agent,
        ...(rects.get(`agent:${agent.id}`) || {}),
        hidden: snapshot.hiddenAgentIds.includes(agent.id),
    }))
}

export function restoreTransientViewTeams(state: StudioState) {
    const snapshot = state.focusSnapshot
    if (!snapshot) return state.teams
    const rects = snapshotRectMap(state)

    return state.teams.map((team) => ({
        ...team,
        ...(rects.get(`team:${team.id}`) || {}),
        hidden: snapshot.hiddenTeamIds.includes(team.id),
    }))
}

export function restoreTransientViewMarkdownEditors(state: StudioState) {
    const snapshot = state.focusSnapshot
    if (!snapshot) return state.markdownEditors

    return state.markdownEditors.map((editor) => ({
        ...editor,
        hidden: snapshot.hiddenEditorIds.includes(editor.id),
    }))
}
