import type {
    SavedWorkspaceSnapshot,
    WorkspaceAgentNode,
    WorkspaceCanvasTerminalNode,
    WorkspaceMarkdownEditorNode,
    WorkspaceTeamParticipantBinding,
    WorkspaceTeamSnapshot,
} from '../../../shared/workspace-contracts'

export type PersistedAgent = WorkspaceAgentNode
export type PersistedMarkdownEditor = Partial<WorkspaceMarkdownEditorNode> & Pick<WorkspaceMarkdownEditorNode, 'id' | 'draftId'> & {
    kind?: string
}
export type PersistedCanvasTerminal = Partial<WorkspaceCanvasTerminalNode> & Pick<WorkspaceCanvasTerminalNode, 'id'>
export type PersistedWorkspaceTeam = Partial<WorkspaceTeamSnapshot> & Pick<WorkspaceTeamSnapshot, 'id' | 'name'> & {
    participants?: Record<string, Partial<WorkspaceTeamParticipantBinding>>
}
export type PersistedWorkspaceSnapshot = SavedWorkspaceSnapshot & {
    agents: PersistedAgent[]
    markdownEditors: PersistedMarkdownEditor[]
    teams?: PersistedWorkspaceTeam[]
    canvasTerminals?: PersistedCanvasTerminal[]
}
