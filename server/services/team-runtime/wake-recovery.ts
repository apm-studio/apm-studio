import type {
    MailboxEvent,
    TeamDefinition,
    WakeCondition,
} from '../../../shared/team-types.js'
import type { WakeUpTarget } from './event-router.js'
import {
    hasRelationPermission,
    isDirectMessageTarget,
    matchesParticipantSubscription,
} from './wake-routing-rules.js'
import { createWakeConditionTriggerTarget } from './wake-condition-events.js'

export function buildRecoverableWakeTarget(params: {
    participantKey: string
    teamDefinition: TeamDefinition
    threadId: string
    recentEvents: MailboxEvent[]
    updatedAt?: number
    triggeredCondition?: WakeCondition | null
}) {
    const {
        participantKey,
        teamDefinition,
        threadId,
        recentEvents,
        updatedAt,
        triggeredCondition,
    } = params

    if (triggeredCondition) {
        return createWakeConditionTriggerTarget({
            threadId,
            participantKey,
            condition: triggeredCondition,
        })
    }

    const candidateEvents = recentEvents
        .filter((event) => typeof updatedAt !== 'number' || event.timestamp <= updatedAt)
        .reverse()

    for (const event of candidateEvents) {
        if (event.source === participantKey) {
            continue
        }

        const relationAllowed = hasRelationPermission(participantKey, event.source, teamDefinition.relations)
        if (!relationAllowed) {
            continue
        }

        if (isDirectMessageTarget(participantKey, event)) {
            return {
                participantKey,
                triggerEvent: event,
                reason: 'subscription',
            } satisfies WakeUpTarget
        }

        const subscriptions = teamDefinition.participants[participantKey]?.subscriptions
        if (matchesParticipantSubscription(participantKey, subscriptions, event)) {
            return {
                participantKey,
                triggerEvent: event,
                reason: 'subscription',
            } satisfies WakeUpTarget
        }
    }

    return null
}
