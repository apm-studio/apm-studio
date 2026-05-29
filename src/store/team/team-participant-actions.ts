import {
    agentNodeToTeamRef,
    autoLayoutBindings,
    createTeamParticipantBinding,
    findExistingParticipantKey,
} from './participant-bindings'
import { buildTeamSelectionState } from './selection-state'
import { scheduleTeamRuntimeSync } from './team-thread-sync'
import type { TeamGetState, TeamSetState } from './action-context'
import type { TeamSlice } from './types'

type TeamParticipantActions = Pick<TeamSlice,
    | 'bindAgentToTeam'
    | 'attachAgentRefToTeam'
    | 'attachAgentToTeam'
    | 'autoLayoutTeamParticipants'
    | 'unbindAgentFromTeam'
    | 'updateAgentBinding'
    | 'reorderTeamParticipants'
    | 'updateTeamParticipantPosition'
>

export function createTeamParticipantActions(set: TeamSetState, get: TeamGetState): TeamParticipantActions {
    return {
        bindAgentToTeam: (teamId, agentRef) => {
            const state = get()
            const team = state.teams.find((entry) => entry.id === teamId)
            if (!team) {
                return null
            }

            const { key: newKey, binding } = createTeamParticipantBinding({
                team,
                agents: state.agents,
                agentRef,
            })
            set((s) => ({
                teams: s.teams.map((teamEntry) => {
                    if (teamEntry.id !== teamId) return teamEntry
                    return {
                        ...teamEntry,
                        participants: { ...teamEntry.participants, [newKey]: binding },
                    }
                }),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [teamId] })
            scheduleTeamRuntimeSync(get, set, teamId)
            return newKey
        },

        attachAgentRefToTeam: (teamId, agentRef) => {
            const state = get()
            const team = state.teams.find((entry) => entry.id === teamId)
            if (!team) {
                return null
            }

            const existingParticipantKey = findExistingParticipantKey(team, agentRef)
            if (existingParticipantKey) {
                set(buildTeamSelectionState(state, teamId))
                return existingParticipantKey
            }

            const newKey = get().bindAgentToTeam(teamId, agentRef)
            get().autoLayoutTeamParticipants(teamId)
            set(buildTeamSelectionState(state, teamId))
            return newKey
        },

        attachAgentToTeam: (teamId, agentId) => {
            const state = get()
            const team = state.teams.find((entry) => entry.id === teamId)
            const agent = state.agents.find((entry) => entry.id === agentId)
            if (!team || !agent) {
                return null
            }

            return get().attachAgentRefToTeam(teamId, agentNodeToTeamRef(agent))
        },

        autoLayoutTeamParticipants: (teamId) => {
            set((s) => ({
                teams: s.teams.map((team) => {
                    if (team.id !== teamId) return team
                    return {
                        ...team,
                        participants: autoLayoutBindings(team.participants),
                    }
                }),
                workspaceDirty: true,
            }))
        },

        unbindAgentFromTeam: (teamId, participantKey) => {
            set((s) => ({
                teams: s.teams.map((team) => {
                    if (team.id !== teamId) return team
                    const rest = { ...team.participants }
                    delete rest[participantKey]
                    const relations = team.relations.filter(
                        (relation) => !relation.between.includes(participantKey),
                    )
                    return { ...team, participants: rest, relations }
                }),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [teamId] })
            scheduleTeamRuntimeSync(get, set, teamId)
        },

        updateAgentBinding: (teamId, participantKey, update) => {
            set((s) => ({
                teams: s.teams.map((team) => {
                    if (team.id !== teamId || !team.participants[participantKey]) return team
                    return {
                        ...team,
                        participants: {
                            ...team.participants,
                            [participantKey]: { ...team.participants[participantKey], ...update },
                        },
                    }
                }),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [teamId] })
            scheduleTeamRuntimeSync(get, set, teamId)
        },

        reorderTeamParticipants: (teamId, orderedParticipantKeys) => {
            set((state) => {
                const team = state.teams.find((entry) => entry.id === teamId)
                if (!team) {
                    return {}
                }

                const currentKeys = Object.keys(team.participants)
                if (currentKeys.length <= 1) {
                    return {}
                }

                const orderedKnownKeys = orderedParticipantKeys.filter((key) => key in team.participants)
                const orderedKnownKeySet = new Set(orderedKnownKeys)
                const nextKeys = [
                    ...orderedKnownKeys,
                    ...currentKeys.filter((key) => !orderedKnownKeySet.has(key)),
                ]

                const orderChanged = nextKeys.length === currentKeys.length
                    && nextKeys.some((key, index) => key !== currentKeys[index])

                if (!orderChanged) {
                    return {}
                }

                return {
                    teams: state.teams.map((entry) => {
                        if (entry.id !== teamId) {
                            return entry
                        }

                        return {
                            ...entry,
                            participants: Object.fromEntries(
                                nextKeys.map((key) => [key, entry.participants[key]]),
                            ),
                        }
                    }),
                    workspaceDirty: true,
                }
            })
        },

        updateTeamParticipantPosition: (teamId, participantKey, x, y) => {
            set((s) => ({
                teams: s.teams.map((team) => {
                    if (team.id !== teamId || !team.participants[participantKey]) return team
                    return {
                        ...team,
                        participants: {
                            ...team.participants,
                            [participantKey]: { ...team.participants[participantKey], position: { x, y } },
                        },
                    }
                }),
                workspaceDirty: true,
            }))
        },
    }
}
