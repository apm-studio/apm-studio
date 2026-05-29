/**
 * wake-cascade.ts — Wake-up orchestration
 *
 * Connects: event-router → wake-prompt-builder → session-queue → session injection
 * PRD §15: After a tool call produces an event, this module:
 * 1. Routes the event to matching participants
 * 2. Builds wake-up prompts for each target
 * 3. Queues or immediately injects the prompt via OpenCode session.promptAsync
 */

import type { MailboxEvent, TeamDefinition } from '../../../shared/team-types.js'
import { routeEvent, type WakeUpTarget } from './event-router.js'
import type { Mailbox } from './mailbox.js'
import type { ThreadManager } from './thread-manager.js'
import { serverDebug } from '../../lib/server-logger.js'
import { eventMatchesConditionExpr } from './wake-evaluator.js'
import {
    clearParticipantQueueRunning,
    getParticipantSessionQueue,
    participantCircuitState,
} from './wake-participant-state.js'
import { injectWakeTarget } from './wake-target-injection.js'
import {
    emptyWakeCascadeResult,
    mergeWakeCascadeResult,
    type WakeCascadeResult,
} from './wake-cascade-result.js'

export { BLOCKED_PROJECTION_RETRY_MESSAGE } from './wake-cascade-constants.js'
export type { WakeCascadeResult } from './wake-cascade-result.js'

export async function drainParticipantQueueAfterSettlement(
    participantKey: string,
    teamDefinition: TeamDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
    workingDir: string,
): Promise<WakeCascadeResult> {
    clearParticipantQueueRunning(threadId, participantKey)
    return drainNextQueuedWake(teamDefinition, mailbox, threadManager, threadId, workingDir, participantKey)
}

/**
 * Fallback: write generic Team tools to execution dir when agent projection
 * is unavailable (no model config or projection failure).
 */
async function drainNextQueuedWake(
    teamDefinition: TeamDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
    workingDir: string,
    settledParticipantKey?: string,
): Promise<WakeCascadeResult> {
    const queue = getParticipantSessionQueue(threadId)

    while (true) {
        const next = queue.dequeueNextRunnable()
        if (!next) {
            return emptyWakeCascadeResult()
        }

        const circuit = participantCircuitState(threadId, next.participantKey)
        if (circuit) {
            console.warn(
                `[wake-cascade] Skipping queued wake for "${next.participantKey}" while circuit is open: ${circuit.reason}`,
            )
            continue
        }

        serverDebug(
            'wake-cascade',
            `Draining queued wake-up for "${next.participantKey}"${settledParticipantKey ? ` after "${settledParticipantKey}" settled` : ''}`,
        )
        return injectWakeTarget({
            target: next.target,
            teamDefinition,
            mailbox,
            threadManager,
            threadId,
            workingDir,
            drainAfterSettlement: () => drainParticipantQueueAfterSettlement(
                next.participantKey,
                teamDefinition,
                mailbox,
                threadManager,
                threadId,
                workingDir,
            ),
        })
    }
}

/**
 * Process an event through the routing and wake-up cascade.
 * Called after tool call routes (send-message, post-to-board, etc.)
 */
export async function processWakeCascade(
    event: MailboxEvent,
    teamDefinition: TeamDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
    workingDir: string,
): Promise<WakeCascadeResult> {
    const result = emptyWakeCascadeResult()

    // 1. Route event to matching participants
    const recentEvents = await threadManager.getRecentEvents(threadId, 20)
    const targets = routeEvent(event, teamDefinition, mailbox, recentEvents)
    result.targets = targets

    serverDebug(
        'wake-cascade',
        `Event type=${event.type} source=${event.source} -> ${targets.length} targets: [${targets.map(t => t.participantKey).join(', ')}]`,
    )
    if (targets.length === 0) {
        // Keep no-match diagnostics available only in verbose mode.
        for (const [key, binding] of Object.entries(teamDefinition.participants)) {
            if (key === event.source) continue
            const hasSubs = !!binding.subscriptions
            const subKeys = binding.subscriptions ? JSON.stringify(binding.subscriptions) : 'none'
            const hasRelation = teamDefinition.relations.some(r => r.between.includes(key) && r.between.includes(event.source || ''))
            serverDebug('wake-cascade', `participant "${key}": subs=${hasSubs}(${subKeys}), relation=${hasRelation}`)
        }
    }

    if (targets.length === 0) return result

    const wakeResult = await processWakeTargets(
        targets,
        teamDefinition,
        mailbox,
        threadManager,
        threadId,
        workingDir,
    )
    mergeWakeCascadeResult(result, wakeResult)

    return result
}

export async function processWakeTargets(
    targets: WakeUpTarget[],
    teamDefinition: TeamDefinition,
    mailbox: Mailbox,
    threadManager: ThreadManager,
    threadId: string,
    workingDir: string,
): Promise<WakeCascadeResult> {
    const result = emptyWakeCascadeResult()
    result.targets = [...targets]

    // 2. Process each wake-up target
    const queue = getParticipantSessionQueue(threadId)

    for (const target of targets) {
        const participantKey = target.participantKey

        if (target.reason === 'wake-condition' && target.wakeCondition) {
            queue.prune(participantKey, (queuedTarget) => {
                if (queuedTarget.reason !== 'subscription') {
                    return false
                }
                return eventMatchesConditionExpr(
                    target.wakeCondition!.condition,
                    queuedTarget.triggerEvent,
                    teamDefinition,
                )
            })
        }

        // Serialize only same-participant wake-ups.
        // Different participants may run concurrently within the same thread.
        if (queue.isRunning(participantKey)) {
            queue.enqueue(participantKey, target)
            result.queued.push(participantKey)
            continue
        }

        const injectionResult = await injectWakeTarget({
            target,
            teamDefinition,
            mailbox,
            threadManager,
            threadId,
            workingDir,
            drainAfterSettlement: () => drainParticipantQueueAfterSettlement(
                participantKey,
                teamDefinition,
                mailbox,
                threadManager,
                threadId,
                workingDir,
            ),
        })
        mergeWakeCascadeResult(result, injectionResult)
    }

    return result
}
