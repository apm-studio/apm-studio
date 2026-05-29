/**
 * wake-evaluator.ts — WakeCondition evaluation engine
 *
 * PRD §14: Evaluates condition expressions against board and event state.
 * Supports all_of, any_of, board_key_exists, message_received, and wake_at.
 */

import type {
    ConditionExpr,
    WakeCondition,
    BoardEntry,
    MailboxEvent,
    TeamDefinition,
} from '../../../shared/team-types.js'
import { payloadString } from './team-runtime-utils.js'

function participantDisplayName(
    teamDefinition: TeamDefinition | undefined,
    participantKey: string | undefined,
) {
    if (!teamDefinition || !participantKey) {
        return null
    }
    const displayName = teamDefinition.participants[participantKey]?.displayName?.trim()
    return displayName || null
}

function matchesParticipantReference(
    teamDefinition: TeamDefinition | undefined,
    participantKey: string | undefined,
    reference: string,
) {
    const normalizedReference = reference.trim().toLowerCase()
    if (!normalizedReference || !participantKey) {
        return false
    }
    if (participantKey.trim().toLowerCase() === normalizedReference) {
        return true
    }
    const displayName = participantDisplayName(teamDefinition, participantKey)
    return displayName?.toLowerCase() === normalizedReference
}

function eventMatchesMessageCondition(
    expr: Extract<ConditionExpr, { type: 'message_received' }>,
    event: MailboxEvent,
    teamDefinition?: TeamDefinition,
) {
    if (event.type !== 'message.sent' && event.type !== 'message.delivered') {
        return false
    }
    const from = payloadString(event.payload, 'from')
    const tag = payloadString(event.payload, 'tag')
    const fromMatch = matchesParticipantReference(teamDefinition, from, expr.from)
    const tagMatch = !expr.tag || tag === expr.tag
    return fromMatch && tagMatch
}

function eventMatchesBoardCondition(
    expr: Extract<ConditionExpr, { type: 'board_key_exists' }>,
    event: MailboxEvent,
) {
    if (event.type !== 'board.posted' && event.type !== 'board.updated') {
        return false
    }
    return payloadString(event.payload, 'key') === expr.key
}

export function eventMatchesConditionExpr(
    expr: ConditionExpr,
    event: MailboxEvent,
    teamDefinition?: TeamDefinition,
): boolean {
    switch (expr.type) {
        case 'all_of':
        case 'any_of':
            return expr.conditions.some((sub) => eventMatchesConditionExpr(sub, event, teamDefinition))
        case 'board_key_exists':
            return eventMatchesBoardCondition(expr, event)
        case 'message_received':
            return eventMatchesMessageCondition(expr, event, teamDefinition)
        case 'wake_at':
            return false
        default:
            return false
    }
}

/**
 * Evaluate a single ConditionExpr against the current context.
 */
export function evaluateConditionExpr(
    expr: ConditionExpr,
    context: {
        board: Map<string, BoardEntry>
        recentEvents: MailboxEvent[]
        teamDefinition?: TeamDefinition
    },
): boolean {
    switch (expr.type) {
        case 'all_of':
            return expr.conditions.every((sub) => evaluateConditionExpr(sub, context))

        case 'any_of':
            return expr.conditions.some((sub) => evaluateConditionExpr(sub, context))

        case 'board_key_exists':
            return context.board.has(expr.key)

        case 'message_received': {
            return context.recentEvents.some((event) => {
                if (event.type !== 'message.sent' && event.type !== 'message.delivered') {
                    return false
                }
                const payload = event.payload as { from?: string; tag?: string }
                const fromMatch = matchesParticipantReference(
                    context.teamDefinition,
                    payload.from,
                    expr.from,
                )
                const tagMatch = !expr.tag || payload.tag === expr.tag
                return fromMatch && tagMatch
            })
        }

        case 'wake_at':
            return Date.now() >= expr.at

        default:
            return false
    }
}

/**
 * Evaluate a WakeCondition against the current mailbox state.
 * Returns true if the condition is satisfied.
 */
export function evaluateWakeCondition(
    condition: WakeCondition,
    board: Map<string, BoardEntry>,
    recentEvents: MailboxEvent[],
    teamDefinition?: TeamDefinition,
): boolean {
    if (condition.status !== 'waiting') return false
    const filteredEvents = typeof condition.createdAt === 'number'
        ? recentEvents.filter((event) => event.timestamp >= condition.createdAt!)
        : recentEvents
    return evaluateConditionExpr(condition.condition, { board, recentEvents: filteredEvents, teamDefinition })
}
