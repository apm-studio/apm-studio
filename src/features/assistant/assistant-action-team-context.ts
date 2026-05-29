import type {
    AssistantParticipantSubscriptionsInput,
    AssistantTeamRelationBlueprint,
} from '../../../shared/assistant-actions'
import { store, type AssistantRefState } from './assistant-action-state'
import {
    getTeamById,
    resolveBoundParticipantKey,
    resolveParticipantKey,
} from './assistant-action-resolvers'

function resolveSubscriptionMessagesFrom(
    refs: AssistantRefState,
    teamId: string,
    subscriptions: AssistantParticipantSubscriptionsInput,
): string[] | null {
    const resolved = new Set<string>()
    const directKeys = subscriptions.messagesFromParticipantKeys || []
    const team = getTeamById(teamId)
    if (!team) return null

    for (const key of directKeys) {
        if (!team.participants[key]) {
            return null
        }
        resolved.add(key)
    }

    for (const agentId of subscriptions.messagesFromAgentIds || []) {
        const key = resolveBoundParticipantKey(refs, teamId, { agentId })
        if (!key) return null
        resolved.add(key)
    }

    for (const agentRef of subscriptions.messagesFromAgentRefs || []) {
        const key = resolveBoundParticipantKey(refs, teamId, { agentRef })
        if (!key) return null
        resolved.add(key)
    }

    for (const agentName of subscriptions.messagesFromAgentNames || []) {
        const key = resolveBoundParticipantKey(refs, teamId, { agentName })
        if (!key) return null
        resolved.add(key)
    }

    return Array.from(resolved)
}

export function buildParticipantSubscriptions(
    refs: AssistantRefState,
    teamId: string,
    subscriptions: AssistantParticipantSubscriptionsInput,
) {
    const messagesFrom = resolveSubscriptionMessagesFrom(refs, teamId, subscriptions)
    if (messagesFrom === null) {
        return null
    }

    return {
        ...(messagesFrom.length > 0 ? { messagesFrom } : {}),
        ...(subscriptions.messageTags !== undefined ? { messageTags: subscriptions.messageTags } : {}),
        ...(subscriptions.callboardKeys !== undefined ? { callboardKeys: subscriptions.callboardKeys } : {}),
        ...(subscriptions.eventTypes !== undefined ? { eventTypes: subscriptions.eventTypes } : {}),
    }
}

export async function applyRelationBlueprint(
    teamId: string,
    relation: AssistantTeamRelationBlueprint,
    refs: AssistantRefState,
): Promise<boolean> {
    const s = store()
    if (!relation.name?.trim() || !relation.description?.trim()) return false
    const sourceOptions = {
        participantKey: relation.sourceParticipantKey,
        agentId: relation.sourceAgentId,
        agentRef: relation.sourceAgentRef,
        agentName: relation.sourceAgentName,
    }
    const targetOptions = {
        participantKey: relation.targetParticipantKey,
        agentId: relation.targetAgentId,
        agentRef: relation.targetAgentRef,
        agentName: relation.targetAgentName,
    }
    const sourceKey = resolveParticipantKey(refs, teamId, {
        participantKey: sourceOptions.participantKey,
        agentId: sourceOptions.agentId,
        agentRef: sourceOptions.agentRef,
        agentName: sourceOptions.agentName,
    })
    const targetKey = resolveParticipantKey(refs, teamId, {
        participantKey: targetOptions.participantKey,
        agentId: targetOptions.agentId,
        agentRef: targetOptions.agentRef,
        agentName: targetOptions.agentName,
    })
    if (!sourceKey || !targetKey || sourceKey === targetKey) return false

    const relationId = s.addRelation(teamId, [sourceKey, targetKey], relation.direction || 'both')
    if (!relationId) return false

    const patch = {
        ...(relation.name ? { name: relation.name } : {}),
        ...(relation.description ? { description: relation.description } : {}),
    }
    if (Object.keys(patch).length > 0) {
        store().updateRelation(teamId, relationId, patch)
    }
    return true
}
