import type {
    WorkspaceCanvasTerminalNode,
    WorkspaceMarkdownEditorNode,
    WorkspaceTeamParticipantBinding,
    WorkspaceTeamSnapshot,
} from '../../../shared/workspace-contracts'
import { createAgentNode } from '../../lib/agents'
import { resolveTeamExpandedHeight, TEAM_DEFAULT_WIDTH } from '../../lib/team-layout'
import type {
    PersistedAgent,
    PersistedCanvasTerminal,
    PersistedMarkdownEditor,
    PersistedWorkspaceSnapshot,
    PersistedWorkspaceTeam,
} from './persisted-workspace-types'

export function hydrateWorkspaceAgents(data: PersistedWorkspaceSnapshot) {
    return (data.agents || []).map((agent: PersistedAgent) => {
        const hydrated = createAgentNode({
            id: agent.id,
            name: agent.name,
            x: agent.position?.x || 0,
            y: agent.position?.y || 0,
            scope: agent.scope || 'shared',
            instructionRef: agent.instructionRef || null,
            agentBody: agent.agentBody || null,
            skillRefs: agent.skillRefs || [],
            model: agent.model || null,
            modelPlaceholder: agent.modelPlaceholder || null,
            modelVariant: agent.modelVariant || null,
            mcpServerNames: agent.mcpServerNames || [],
            mcpBindingMap: agent.mcpBindingMap || {},
            declaredMcpConfig: agent.declaredMcpConfig || null,
            planMode: agent.planMode || false,
            hidden: agent.hidden || false,
            meta: agent.meta,
        })
        return {
            ...hydrated,
            position: agent.position || hydrated.position,
            width: agent.width || hydrated.width,
            height: agent.height || hydrated.height,
        }
    })
}

export function hydrateWorkspaceMarkdownEditors(data: PersistedWorkspaceSnapshot): WorkspaceMarkdownEditorNode[] {
    return (data.markdownEditors || []).map((editor: PersistedMarkdownEditor) => {
        const kind: WorkspaceMarkdownEditorNode['kind'] = editor.kind === 'skill' ? 'skill' : 'instruction'
        return {
            id: editor.id,
            kind,
            position: editor.position || { x: 160, y: 160 },
            width: editor.width || 520,
            height: editor.height || 360,
            draftId: editor.draftId,
            baseline: editor.baseline || null,
            attachTarget: editor.attachTarget || null,
            hidden: !!editor.hidden,
        }
    })
}

export function hydrateWorkspaceTeams(data: PersistedWorkspaceSnapshot): WorkspaceTeamSnapshot[] {
    if (!Array.isArray(data.teams)) return []

    const normalizeSubscriptions = (subscriptions: WorkspaceTeamParticipantBinding['subscriptions']) => {
        if (!subscriptions) return subscriptions
        return {
            ...subscriptions,
            ...(subscriptions.callboardKeys ? { callboardKeys: subscriptions.callboardKeys } : {}),
        }
    }

    return data.teams.map((team: PersistedWorkspaceTeam, index: number) => {
        const participants = typeof team.participants === 'object' && team.participants
            ? Object.fromEntries(
                Object.entries(team.participants).map(([key, binding]: [string, Partial<WorkspaceTeamParticipantBinding>], agentIndex: number) => [key, {
                    ...binding,
                    subscriptions: normalizeSubscriptions(binding?.subscriptions),
                    position: binding?.position || { x: agentIndex * 300, y: 100 },
                }]),
            ) as Record<string, WorkspaceTeamParticipantBinding>
            : {}

        return {
            ...team,
            participants,
            relations: Array.isArray(team.relations) ? team.relations : [],
            position: team.position || { x: 200, y: 200 + index * 120 },
            width: team.width || TEAM_DEFAULT_WIDTH,
            height: resolveTeamExpandedHeight(team.height),
            createdAt: typeof team.createdAt === 'number' ? team.createdAt : Date.now(),
        }
    })
}

export function hydrateWorkspaceCanvasTerminals(data: PersistedWorkspaceSnapshot): WorkspaceCanvasTerminalNode[] {
    return (data.canvasTerminals || []).map((terminal: PersistedCanvasTerminal) => ({
        id: terminal.id,
        title: terminal.title || 'Terminal',
        position: terminal.position || { x: 200, y: 200 },
        width: terminal.width || 600,
        height: terminal.height || 400,
        sessionId: null,
        connected: false,
    }))
}

export function hydrateWorkspaceChatBindings(data: PersistedWorkspaceSnapshot) {
    const chatKeyToSession: Record<string, string> = { ...(data.chatBindings || {}) }
    return {
        chatKeyToSession,
        sessionToChatKey: Object.fromEntries(
            Object.entries(chatKeyToSession).map(([chatKey, sessionId]) => [sessionId, chatKey]),
        ),
    }
}
