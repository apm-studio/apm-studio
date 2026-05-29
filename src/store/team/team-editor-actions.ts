import type { TeamSetState } from './action-context'
import {
    buildTeamEditorSelectionState,
    createTeamEditorState,
} from './selection-state'
import type { TeamSlice } from './types'

type TeamEditorActions = Pick<TeamSlice,
    | 'openTeamEditor'
    | 'closeTeamEditor'
    | 'openTeamParticipantEditor'
    | 'openTeamRelationEditor'
>

export function createTeamEditorActions(set: TeamSetState): TeamEditorActions {
    return {
        openTeamEditor: (teamId, mode = 'team', options = {}) => {
            set((state) => buildTeamEditorSelectionState(
                state,
                teamId,
                createTeamEditorState(teamId, mode, options),
            ))
        },

        closeTeamEditor: () => {
            set({ teamEditorState: null })
        },

        openTeamParticipantEditor: (teamId, participantKey) => {
            set((state) => buildTeamEditorSelectionState(
                state,
                teamId,
                createTeamEditorState(teamId, 'participant', { participantKey }),
            ))
        },

        openTeamRelationEditor: (teamId, relationId) => {
            set((state) => buildTeamEditorSelectionState(
                state,
                teamId,
                createTeamEditorState(teamId, 'relation', { relationId }),
            ))
        },
    }
}
