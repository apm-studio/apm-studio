import type { PackageLibraryItem } from '../../lib/primitive-types'
import type {
    TeamParticipantSessionStatus,
    TeamRelation,
} from '../../../shared/team-types'
import type {
    WorkspaceTeamParticipantBinding,
    WorkspaceTeamSnapshot,
} from '../../../shared/workspace-contracts'

export interface TeamThreadState {
    id: string
    teamId: string
    name?: string
    status: 'active' | 'idle' | 'completed' | 'interrupted'
    participantSessions: Record<string, string>
    participantStatuses: Record<string, TeamParticipantSessionStatus>
    createdAt: number
}

export type TeamEditorTab = 'overview' | 'participants' | 'relations' | 'rules'

export interface TeamEditorState {
    teamId: string
    mode: 'team' | 'participant' | 'relation'
    tab?: TeamEditorTab | null
    participantKey: string | null
    relationId: string | null
}

export interface TeamSlice {
    teams: WorkspaceTeamSnapshot[]
    selectedTeamId: string | null
    teamEditorState: TeamEditorState | null

    teamThreads: Record<string, TeamThreadState[]>
    activeThreadId: string | null
    activeThreadParticipantKey: string | null

    addTeam: (name: string) => string
    removeTeam: (id: string) => void
    renameTeam: (id: string, name: string) => void
    updateTeamDescription: (id: string, description: string) => void
    updateTeamRules: (id: string, rules: string[]) => void
    updateTeamSafety: (id: string, safety: WorkspaceTeamSnapshot['safety']) => void
    selectTeam: (id: string | null) => void
    toggleTeamVisibility: (id: string) => void

    bindAgentToTeam: (teamId: string, agentRef: WorkspaceTeamParticipantBinding['agentRef']) => string | null
    attachAgentRefToTeam: (teamId: string, agentRef: WorkspaceTeamParticipantBinding['agentRef']) => string | null
    attachAgentToTeam: (teamId: string, agentId: string) => string | null
    autoLayoutTeamParticipants: (teamId: string) => void
    unbindAgentFromTeam: (teamId: string, participantKey: string) => void
    updateAgentBinding: (teamId: string, participantKey: string, update: Partial<WorkspaceTeamParticipantBinding>) => void
    reorderTeamParticipants: (teamId: string, orderedParticipantKeys: string[]) => void
    openTeamEditor: (
        teamId: string,
        mode?: TeamEditorState['mode'],
        options?: { participantKey?: string | null; relationId?: string | null; tab?: TeamEditorTab | null }
    ) => void
    closeTeamEditor: () => void
    openTeamParticipantEditor: (teamId: string, participantKey: string) => void
    openTeamRelationEditor: (teamId: string, relationId: string) => void
    updateTeamParticipantPosition: (teamId: string, participantKey: string, x: number, y: number) => void

    addRelation: (teamId: string, between: [string, string], direction: 'both' | 'one-way') => string | null
    removeRelation: (teamId: string, relationId: string) => void
    updateRelation: (teamId: string, relationId: string, update: Partial<TeamRelation>) => void

    updateTeamPosition: (id: string, x: number, y: number) => void
    updateTeamSize: (id: string, width: number, height: number) => void

    updateTeamAuthoringMeta: (id: string, meta: WorkspaceTeamSnapshot['meta']) => void
    importTeamFromPrimitive: (primitive: PackageLibraryItem) => Promise<void>

    createThread: (teamId: string) => Promise<string>
    selectThread: (teamId: string, threadId: string | null) => void
    selectThreadParticipant: (participantKey: string | null) => void
    loadThreads: (teamId: string) => Promise<void>
    deleteThread: (teamId: string, threadId: string) => Promise<void>
    renameThread: (teamId: string, threadId: string, name: string) => Promise<void>
}
