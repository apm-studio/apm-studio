import { nanoid } from 'nanoid'
import type { WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { teamRuntimeApi } from '../../api-clients/team-runtime'
import {
    collectVisibleCanvasNodeRects,
    resolveCanvasNodeSpawnPosition,
} from '../../lib/canvas-node-layout'
import {
    resolveFocusTarget,
    resolveNodeBaselineHidden,
    setFocusSnapshotNodeHidden,
} from '../../lib/focus-utils'
import {
    TEAM_DEFAULT_EXPANDED_HEIGHT,
    TEAM_DEFAULT_WIDTH,
} from '../../lib/team-layout'
import { showToast } from '../../lib/toast'
import { collectTeamSessionTargets, detachSessionTargets } from '../session/session-lifecycle'
import type { StudioState } from '../types'
import { buildExitFocusModeState } from '../workspace/focus-mode-state'
import type { TeamGetState, TeamSetState } from './action-context'
import { buildSelectTeamState } from './selection-state'
import { scheduleTeamRuntimeSync } from './team-thread-sync'
import type { TeamSlice } from './types'

type TeamDefinitionActions = Pick<TeamSlice,
    | 'addTeam'
    | 'removeTeam'
    | 'renameTeam'
    | 'updateTeamDescription'
    | 'updateTeamRules'
    | 'updateTeamSafety'
    | 'selectTeam'
    | 'toggleTeamVisibility'
>

export function createTeamDefinitionActions(set: TeamSetState, get: TeamGetState): TeamDefinitionActions {
    return {
        addTeam: (name) => {
            const id = nanoid(12)
            const state = get()
            const spawnPosition = resolveCanvasNodeSpawnPosition({
                canvasCenter: state.canvasCenter,
                occupiedRects: collectVisibleCanvasNodeRects(state.agents, state.teams),
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
            })
            const team: WorkspaceTeamSnapshot = {
                id,
                name,
                position: spawnPosition,
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
            }
            set((s) => ({
                teams: [...s.teams, team],
                selectedTeamId: id,
                selectedAgentId: null,
                canvasRevealTarget: {
                    id,
                    type: 'team',
                    nonce: (s.canvasRevealTarget?.nonce || 0) + 1,
                },
                teamEditorState: null,
                activeThreadId: null,
                activeThreadParticipantKey: null,
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [id] })
            return id
        },

        removeTeam: (id) => {
            const sessionTargets = collectTeamSessionTargets(get(), id)
            detachSessionTargets(set, get, sessionTargets)
            set((s) => {
                const focusExit = buildExitFocusModeState(s)
                const teams = (focusExit?.teams as StudioState['teams'] | undefined) || s.teams

                return {
                    ...focusExit,
                    teams: teams.filter((team) => team.id !== id),
                    teamThreads: Object.fromEntries(
                        Object.entries(s.teamThreads).filter(([teamId]) => teamId !== id),
                    ),
                    selectedTeamId: s.selectedTeamId === id ? null : s.selectedTeamId,
                    teamEditorState: s.teamEditorState?.teamId === id ? null : s.teamEditorState,
                    activeThreadId: s.selectedTeamId === id ? null : s.activeThreadId,
                    activeThreadParticipantKey: s.selectedTeamId === id ? null : s.activeThreadParticipantKey,
                    workspaceDirty: true,
                }
            })
            void teamRuntimeApi.deleteTeam(id)
                .catch((error) => {
                    console.error('Failed to delete Team runtime sessions', error)
                    showToast('APM Studio could not delete every runtime thread for that Team.', 'error', {
                        title: 'Team cleanup failed',
                        dedupeKey: `team:delete-runtime:${id}`,
                    })
                })
                .finally(() => {
                    void get().listSessions()
                })
            get().recordStudioChange({ kind: 'team', teamIds: [id], workspaceWide: true })
        },

        renameTeam: (id, name) => {
            set((s) => ({
                teams: s.teams.map((team) => (team.id === id ? { ...team, name } : team)),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [id] })
            scheduleTeamRuntimeSync(get, set, id)
        },

        updateTeamDescription: (id, description) => {
            set((s) => ({
                teams: s.teams.map((team) => (team.id === id ? { ...team, description } : team)),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [id] })
            scheduleTeamRuntimeSync(get, set, id)
        },

        updateTeamRules: (id, rules) => {
            set((s) => ({
                teams: s.teams.map((team) => (team.id === id ? { ...team, teamRules: rules } : team)),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [id] })
            scheduleTeamRuntimeSync(get, set, id)
        },

        updateTeamSafety: (id, safety) => {
            set((s) => ({
                teams: s.teams.map((team) => (team.id === id ? { ...team, safety } : team)),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [id] })
            scheduleTeamRuntimeSync(get, set, id)
        },

        selectTeam: (id) => {
            set((state) => buildSelectTeamState(state, id))
            if (id) {
                void get().loadThreads(id)
            }
        },

        toggleTeamVisibility: (id) => {
            set((s) => {
                const focusedTarget = resolveFocusTarget(s.focusSnapshot)
                const currentHidden = resolveNodeBaselineHidden(
                    s.focusSnapshot,
                    id,
                    'team',
                    !!s.teams.find((team) => team.id === id)?.hidden,
                )
                const nextHidden = !currentHidden

                if (s.focusSnapshot && (focusedTarget?.id !== id || focusedTarget?.type !== 'team')) {
                    return {
                        focusSnapshot: setFocusSnapshotNodeHidden(s.focusSnapshot, id, 'team', nextHidden),
                        workspaceDirty: true,
                    }
                }

                const focusExit = buildExitFocusModeState(s)
                const teams = (focusExit?.teams as StudioState['teams'] | undefined) || s.teams

                return {
                    ...focusExit,
                    teams: teams.map((team) => (team.id === id ? { ...team, hidden: nextHidden } : team)),
                    workspaceDirty: true,
                }
            })
        },
    }
}
