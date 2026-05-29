/**
 * event-router.ts — Subscription + relation-based event routing
 *
 * PRD §15.2: Routes events to participants based on:
 * 1. Subscription + relation permission match
 * 2. WakeCondition satisfaction
 */

import type {
    MailboxEvent,
    TeamDefinition,
    WakeCondition,
    BoardEntry,
} from '../../../shared/team-types.js'
import { Mailbox } from './mailbox.js'
import { evaluateWakeCondition, eventMatchesConditionExpr } from './wake-evaluator.js'
import {
    hasRelationPermission,
    isDirectMessageTarget,
    matchesParticipantSubscription,
} from './wake-routing-rules.js'

// ── Types ───────────────────────────────────────────────

export interface WakeUpTarget {
    participantKey: string
    triggerEvent: MailboxEvent
    wakeCondition?: WakeCondition  // set if condition-triggered
    reason: 'subscription' | 'wake-condition'
}

function hasRelevantWaitingCondition(
    participantKey: string,
    event: MailboxEvent,
    mailbox: Mailbox,
    teamDefinition: TeamDefinition,
) {
    const waitingConditions = mailbox.getWakeConditionsForParticipant(participantKey, {
        statuses: ['waiting'],
    })
    return waitingConditions.some((condition) => eventMatchesConditionExpr(condition.condition, event, teamDefinition))
}

// ── Main routing function ───────────────────────────────

export function routeEvent(
    event: MailboxEvent,
    teamDefinition: TeamDefinition,
    mailbox: Mailbox,
    recentEvents: MailboxEvent[],
): WakeUpTarget[] {
    const targetsByParticipant = new Map<string, WakeUpTarget>()

    // 1. Subscription + relation based wake-up
    for (const [key, binding] of Object.entries(teamDefinition.participants)) {
        if (key === event.source) continue  // Don't wake the source

        const subMatch = matchesParticipantSubscription(key, binding.subscriptions, event)
        const relMatch = hasRelationPermission(key, event.source, teamDefinition.relations)
        const waitingConditionMatch = hasRelevantWaitingCondition(key, event, mailbox, teamDefinition)

        // Direct message: always wake the recipient if relation allows it.
        // 1:1 messages don't need explicit subscription — the `to` field is the routing key.
        const directMessageTarget = isDirectMessageTarget(key, event)

        if (!waitingConditionMatch && ((subMatch && relMatch) || (directMessageTarget && relMatch))) {
            targetsByParticipant.set(key, {
                participantKey: key,
                triggerEvent: event,
                reason: 'subscription',
            })
        }
    }

    // 2. WakeCondition based wake-up
    const triggeredConditions = mailbox.evaluateConditions(
        event,
        (cond: WakeCondition, board: Map<string, BoardEntry>, events: MailboxEvent[]) =>
            evaluateWakeCondition(cond, board, events, teamDefinition),
        recentEvents,
    )

    for (const cond of triggeredConditions) {
        targetsByParticipant.set(cond.createdBy, {
            participantKey: cond.createdBy,
            triggerEvent: event,
            wakeCondition: cond,
            reason: 'wake-condition',
        })
    }

    return Array.from(targetsByParticipant.values())
}
