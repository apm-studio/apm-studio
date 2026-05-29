import type { AssistantAction } from '../../../shared/assistant-actions'
import { autoLayoutAssistantTeamCluster } from './assistant-action-canvas'
import {
    applyRelationBlueprint,
    buildParticipantSubscriptions,
} from './assistant-action-team-context'
import {
    getTeamById,
    hasRelation,
    resolveAgentId,
    resolveBoundParticipantKey,
    resolveTeamId,
    resolveTeamParticipantAgentIds,
} from './assistant-action-resolvers'
import {
    store,
    type AssistantRefState,
} from './assistant-action-state'

export async function applyAssistantTeamAction(
    action: AssistantAction,
    refs: AssistantRefState,
): Promise<{ success: boolean } | null> {
    switch (action.type) {
        case 'createTeam': {
            if ((action.relations || []).some((relation) => !relation.name?.trim() || !relation.description?.trim())) {
                return { success: false }
            }
            const teamId = store().addTeam(action.name)
            if (action.ref) refs.teams.set(action.ref, teamId)
            if (action.description) store().updateTeamDescription(teamId, action.description)
            if (action.teamRules !== undefined) store().updateTeamRules(teamId, action.teamRules)
            if (action.safety !== undefined) store().updateTeamSafety(teamId, action.safety)
            const participantAgentIds = resolveTeamParticipantAgentIds(refs, action)
            for (const id of participantAgentIds) {
                store().attachAgentToTeam(teamId, id)
            }
            for (const relation of action.relations || []) {
                await applyRelationBlueprint(teamId, relation, refs)
            }
            autoLayoutAssistantTeamCluster(refs, teamId, participantAgentIds)
            return { success: true }
        }
        case 'updateTeam': {
            const teamId = resolveTeamId(refs, action)
            if (!teamId) return { success: false }
            if (action.name) store().renameTeam(teamId, action.name)
            if (action.description !== undefined) store().updateTeamDescription(teamId, action.description)
            if (action.teamRules !== undefined) store().updateTeamRules(teamId, action.teamRules)
            if (action.safety !== undefined) store().updateTeamSafety(teamId, action.safety ?? undefined)
            return { success: true }
        }
        case 'deleteTeam': {
            const teamId = resolveTeamId(refs, action)
            if (!teamId) return { success: false }
            store().removeTeam(teamId)
            return { success: true }
        }
        case 'attachAgentToTeam': {
            const teamId = resolveTeamId(refs, action)
            const agentId = resolveAgentId(refs, action)
            if (!teamId || !agentId) return { success: false }
            return { success: !!store().attachAgentToTeam(teamId, agentId) }
        }
        case 'detachParticipantFromTeam': {
            const teamId = resolveTeamId(refs, action)
            if (!teamId) return { success: false }
            const team = getTeamById(teamId)
            if (!team) return { success: false }
            const key = resolveBoundParticipantKey(refs, teamId, action)
            if (!key || !team.participants[key]) return { success: false }
            store().unbindAgentFromTeam(teamId, key)
            return { success: true }
        }
        case 'updateParticipantSubscriptions': {
            const teamId = resolveTeamId(refs, action)
            if (!teamId) return { success: false }
            const participantKey = resolveBoundParticipantKey(refs, teamId, action)
            if (!participantKey) return { success: false }
            if (action.subscriptions === null) {
                store().updateAgentBinding(teamId, participantKey, { subscriptions: undefined })
                return { success: true }
            }
            const subscriptions = buildParticipantSubscriptions(refs, teamId, action.subscriptions)
            if (!subscriptions) return { success: false }
            store().updateAgentBinding(teamId, participantKey, { subscriptions })
            return { success: true }
        }
        case 'connectAgents': {
            const teamId = resolveTeamId(refs, action)
            if (!teamId) return { success: false }
            if (!action.name?.trim() || !action.description?.trim()) return { success: false }
            const ok = await applyRelationBlueprint(teamId, action, refs)
            return { success: ok }
        }
        case 'updateRelation': {
            const teamId = resolveTeamId(refs, action)
            if (!teamId || !hasRelation(teamId, action.relationId)) return { success: false }
            const patch = {
                ...(action.name !== undefined ? { name: action.name } : {}),
                ...(action.description !== undefined ? { description: action.description } : {}),
                ...(action.direction !== undefined ? { direction: action.direction } : {}),
            }
            store().updateRelation(teamId, action.relationId, patch)
            return { success: true }
        }
        case 'removeRelation': {
            const teamId = resolveTeamId(refs, action)
            if (!teamId || !hasRelation(teamId, action.relationId)) return { success: false }
            store().removeRelation(teamId, action.relationId)
            return { success: true }
        }
        default:
            return null
    }
}
