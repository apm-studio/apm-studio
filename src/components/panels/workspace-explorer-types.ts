import type { WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import type { TeamSlice } from '../../store/team/types'
import type { WorkspaceSlice } from '../../store/workspace/types'

export type WorkspaceExplorerEditingTarget = WorkspaceSlice['editingTarget']
export type WorkspaceExplorerTeam = WorkspaceTeamSnapshot
export type WorkspaceExplorerTeamThread = TeamSlice['teamThreads'][string][number]
export type AgentEditorFocus = Parameters<WorkspaceSlice['openAgentEditor']>[1]
