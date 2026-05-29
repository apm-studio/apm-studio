import type {
    MailboxEvent,
    ParticipantSubscriptions,
    TeamRelation,
} from '../../../shared/team-types.js'
import { payloadString } from './team-runtime-utils.js'

export function matchCallboardKey(patterns: string[] | undefined, key: string | undefined) {
    if (!key || !patterns?.length) {
        return false
    }

    return patterns.some((pattern) => {
        if (pattern.endsWith('*')) {
            return key.startsWith(pattern.slice(0, -1))
        }
        return key === pattern
    })
}

export function hasRelationPermission(
    participantKey: string,
    source: string,
    relations: TeamRelation[],
) {
    if (!source || source === participantKey) {
        return false
    }

    return relations.some((relation) => {
        const [left, right] = relation.between
        const pairMatch = (left === source && right === participantKey) || (left === participantKey && right === source)
        if (!pairMatch) {
            return false
        }
        if (relation.direction === 'one-way') {
            return left === source && right === participantKey
        }
        return true
    })
}

export function matchesParticipantSubscription(
    participantKey: string,
    subscriptions: ParticipantSubscriptions | undefined,
    event: MailboxEvent,
) {
    if (!subscriptions) {
        return false
    }

    switch (event.type) {
        case 'message.sent':
        case 'message.delivered': {
            if (!isDirectMessageTarget(participantKey, event)) {
                return false
            }
            const from = payloadString(event.payload, 'from')
            const tag = payloadString(event.payload, 'tag')
            return (subscriptions.messagesFrom?.includes(from || '') ?? false)
                || (subscriptions.messageTags?.includes(tag || '') ?? false)
        }
        case 'board.posted':
        case 'board.updated':
            return matchCallboardKey(subscriptions.callboardKeys, payloadString(event.payload, 'key'))
        case 'runtime.idle':
            return subscriptions.eventTypes?.includes('runtime.idle') ?? false
        default:
            return false
    }
}

export function isDirectMessageTarget(participantKey: string, event: MailboxEvent) {
    return (event.type === 'message.sent' || event.type === 'message.delivered')
        && payloadString(event.payload, 'to') === participantKey
}
