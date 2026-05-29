import { teamRuntimeApi } from '../../api-clients/team-runtime'
import { showToast } from '../../lib/toast'
import { collectTeamThreadSessionTargets, detachSessionTargets } from '../session/session-lifecycle'
import type { StudioState } from '../types'
import type { TeamGetState, TeamSetState } from './action-context'
import { buildDeletedTeamThreadState, buildTeamThreadSelectionState } from './selection-state'
import {
    createTeamThreadImpl,
    loadTeamThreadsImpl,
} from './team-thread-sync'
import type { TeamSlice } from './types'

type TeamThreadActions = Pick<TeamSlice,
    | 'createThread'
    | 'selectThread'
    | 'selectThreadParticipant'
    | 'loadThreads'
    | 'deleteThread'
    | 'renameThread'
>

export function createTeamThreadActions(set: TeamSetState, get: TeamGetState): TeamThreadActions {
    return {
        createThread: async (teamId) => createTeamThreadImpl(get, set, teamId),

        selectThread: (teamId, threadId) => {
            set((state) => buildTeamThreadSelectionState(state, teamId, threadId))
        },

        selectThreadParticipant: (participantKey) => {
            set((state) => {
                if (!state.selectedTeamId || !state.activeThreadId) {
                    return {}
                }

                return buildTeamThreadSelectionState(
                    state,
                    state.selectedTeamId,
                    state.activeThreadId,
                    participantKey,
                )
            })
        },

        loadThreads: async (teamId) => loadTeamThreadsImpl(get, set, teamId),

        deleteThread: async (teamId, threadId) => {
            const threadSessionTargets = collectTeamThreadSessionTargets(get(), teamId, threadId)
            await teamRuntimeApi.deleteThread(teamId, threadId)
            detachSessionTargets(set, get, threadSessionTargets)
            set((state: StudioState) => buildDeletedTeamThreadState(state, teamId, threadId))
            void get().listSessions()
        },

        renameThread: async (teamId, threadId, name) => {
            const trimmed = name.trim()
            if (!trimmed) {
                return
            }

            const previousThreads = get().teamThreads[teamId] || []
            set((state: StudioState) => ({
                teamThreads: {
                    ...state.teamThreads,
                    [teamId]: (state.teamThreads[teamId] || []).map((thread) =>
                        thread.id === threadId ? { ...thread, name: trimmed } : thread,
                    ),
                },
            }))

            try {
                await teamRuntimeApi.renameThread(teamId, threadId, trimmed)
                await loadTeamThreadsImpl(get, set, teamId)
            } catch (error) {
                console.error('[team-thread] Failed to rename thread', error)
                set((state: StudioState) => ({
                    teamThreads: {
                        ...state.teamThreads,
                        [teamId]: previousThreads,
                    },
                }))
                showToast('APM Studio could not rename that Team thread.', 'error', {
                    title: 'Thread rename failed',
                    dedupeKey: `team-thread:rename:${teamId}:${threadId}`,
                })
            }
        },
    }
}
