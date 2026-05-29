import type { TeamRelation } from '../../../shared/team-types'
import type { StudioState } from '../types'
import type { TeamGetState, TeamSetState } from './action-context'
import {
    resolveBindingDisplayName,
    resolveTeamParticipantName,
} from './participant-bindings'
import { resolveTeamEditorStateAfterRelationRemoval } from './selection-state'
import { scheduleTeamRuntimeSync } from './team-thread-sync'
import type { TeamSlice } from './types'

type TeamRelationActions = Pick<TeamSlice,
    | 'addRelation'
    | 'removeRelation'
    | 'updateRelation'
>

export function relationConflicts(
    left: { between: [string, string]; direction: 'both' | 'one-way' },
    right: { between: [string, string]; direction: 'both' | 'one-way' },
) {
    const sameOrderedPair = left.between[0] === right.between[0] && left.between[1] === right.between[1]
    const sameUnorderedPair = sameOrderedPair
        || (left.between[0] === right.between[1] && left.between[1] === right.between[0])

    if (left.direction === 'both' || right.direction === 'both') {
        return sameUnorderedPair
    }

    return sameOrderedPair && left.direction === right.direction
}

export function addTeamRelationImpl(
    get: TeamGetState,
    set: TeamSetState,
    teamId: string,
    between: [string, string],
    direction: 'both' | 'one-way',
) {
    const team = get().teams.find((entry) => entry.id === teamId)
    const agents = get().agents
    const leftBinding = team?.participants[between[0]]
    const rightBinding = team?.participants[between[1]]
    const leftFallbackLabel = leftBinding ? resolveBindingDisplayName(leftBinding, between[0]) : between[0]
    const rightFallbackLabel = rightBinding ? resolveBindingDisplayName(rightBinding, between[1]) : between[1]
    const leftLabel = resolveTeamParticipantName(agents, leftBinding, leftFallbackLabel)
    const rightLabel = resolveTeamParticipantName(agents, rightBinding, rightFallbackLabel)

    const relation: TeamRelation = {
        id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        between,
        direction,
        name: `${leftLabel}_to_${rightLabel}`,
        description: `Communication relation between ${leftLabel} and ${rightLabel}`,
    }
    let inserted = false
    let existingRelationId: string | null = null
    set((state: StudioState) => ({
        teams: state.teams.map((entry) => {
            if (entry.id !== teamId) return entry
            const existing = entry.relations.find((item) => relationConflicts(item, relation))
            if (existing) {
                existingRelationId = existing.id
                return entry
            }
            inserted = true
            return { ...entry, relations: [...entry.relations, relation] }
        }),
        workspaceDirty: true,
    }))
    if (inserted) {
        get().recordStudioChange({ kind: 'team', teamIds: [teamId] })
        scheduleTeamRuntimeSync(get, set, teamId)
    }
    return inserted ? relation.id : existingRelationId
}

export function createTeamRelationActions(set: TeamSetState, get: TeamGetState): TeamRelationActions {
    return {
        addRelation: (teamId, between, direction) => addTeamRelationImpl(get, set, teamId, between, direction),

        removeRelation: (teamId, relationId) => {
            set((s) => {
                const team = s.teams.find((entry) => entry.id === teamId)
                if (!team) return {}

                const nextRelations = team.relations.filter((relation) => relation.id !== relationId)
                const referencedKeys = new Set<string>()
                for (const relation of nextRelations) {
                    for (const key of relation.between) {
                        referencedKeys.add(key)
                    }
                }
                const nextParticipants = nextRelations.length === 0
                    ? {}
                    : Object.fromEntries(
                        Object.entries(team.participants).filter(([key]) => referencedKeys.has(key)),
                    )

                const nextTeamEditorState = resolveTeamEditorStateAfterRelationRemoval(
                    s.teamEditorState,
                    teamId,
                    relationId,
                    nextParticipants,
                )

                return {
                    teams: s.teams.map((entry) => {
                        if (entry.id !== teamId) return entry
                        return { ...entry, participants: nextParticipants, relations: nextRelations }
                    }),
                    teamEditorState: nextTeamEditorState,
                    workspaceDirty: true,
                }
            })
            get().recordStudioChange({ kind: 'team', teamIds: [teamId] })
            scheduleTeamRuntimeSync(get, set, teamId)
        },

        updateRelation: (teamId, relationId, update) => {
            set((s) => ({
                teams: s.teams.map((team) => {
                    if (team.id !== teamId) return team

                    const current = team.relations.find((relation) => relation.id === relationId)
                    if (!current) {
                        return team
                    }

                    const nextRelation = { ...current, ...update }
                    return {
                        ...team,
                        relations: team.relations.filter((relation) => {
                            if (relation.id === relationId) {
                                return true
                            }

                            return !relationConflicts(nextRelation, relation)
                        }).map((relation) => (
                            relation.id === relationId ? nextRelation : relation
                        )),
                    }
                }),
                workspaceDirty: true,
            }))
            get().recordStudioChange({ kind: 'team', teamIds: [teamId] })
            scheduleTeamRuntimeSync(get, set, teamId)
        },
    }
}
