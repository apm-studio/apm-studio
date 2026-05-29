import {
    TEAM_DEFAULT_EXPANDED_HEIGHT,
    TEAM_DEFAULT_WIDTH,
} from '../../lib/team-layout'
import type { TeamGetState, TeamSetState } from './action-context'
import { importTeamFromPrimitiveImpl } from './team-import'
import type { TeamSlice } from './types'

type TeamAuthoringActions = Pick<TeamSlice,
    | 'updateTeamAuthoringMeta'
    | 'importTeamFromPrimitive'
>

export function createTeamAuthoringActions(set: TeamSetState, get: TeamGetState): TeamAuthoringActions {
    return {
        updateTeamAuthoringMeta: (id, meta) => {
            set((s) => ({
                teams: s.teams.map((team) => (team.id === id ? { ...team, meta: { ...team.meta, ...meta } } : team)),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [id] })
        },

        importTeamFromPrimitive: async (primitive) => {
            await importTeamFromPrimitiveImpl(get, set, primitive, {
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
            })
        },
    }
}
