import type { TeamSetState } from './action-context'
import type { TeamSlice } from './types'

type TeamCanvasActions = Pick<TeamSlice,
    | 'updateTeamPosition'
    | 'updateTeamSize'
>

export function createTeamCanvasActions(set: TeamSetState): TeamCanvasActions {
    return {
        updateTeamPosition: (id, x, y) => {
            set((s) => ({
                teams: s.teams.map((team) => (team.id === id ? { ...team, position: { x, y } } : team)),
                workspaceDirty: true,
            }))
        },

        updateTeamSize: (id, width, height) => {
            set((s) => ({
                teams: s.teams.map((team) => (team.id === id ? { ...team, width, height } : team)),
                workspaceDirty: true,
            }))
        },
    }
}
