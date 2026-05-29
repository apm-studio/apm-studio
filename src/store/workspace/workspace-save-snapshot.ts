import type { SavedWorkspaceSnapshot } from '../../../shared/workspace-contracts'
import type { StudioState } from '../types'
import { normalizePath } from './helpers'
import {
    restoreTransientViewAgents,
    restoreTransientViewMarkdownEditors,
    restoreTransientViewTeams,
} from './workspace-transient-view'

export function buildSavedWorkspaceSnapshot(state: StudioState): SavedWorkspaceSnapshot {
    const agents = restoreTransientViewAgents(state)
    const markdownEditors = restoreTransientViewMarkdownEditors(state)
    const teams = restoreTransientViewTeams(state)
    const normalizedAgents = agents.map((agent) => ({
        ...agent,
        declaredMcpConfig: agent.declaredMcpConfig || null,
        mcpBindingMap: agent.mcpBindingMap || {},
        modelPlaceholder: agent.modelPlaceholder || null,
    }))
    const chatBindings = Object.fromEntries(
        Object.entries(state.chatKeyToSession).filter(([, sessionId]) => !!sessionId),
    )

    return {
        schemaVersion: 1,
        workingDir: normalizePath(state.workingDir),
        agents: normalizedAgents,
        chatBindings,
        assistantModel: state.assistantModel,
        appliedAssistantActionMessageIds: state.appliedAssistantActionMessageIds,
        assistantActionResults: state.assistantActionResults,
        markdownEditors,
        canvasTerminals: state.canvasTerminals.map((terminal) => ({
            ...terminal,
            sessionId: null,
            connected: false,
        })),
        teams,
    }
}
