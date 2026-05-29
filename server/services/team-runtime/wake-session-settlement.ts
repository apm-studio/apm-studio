import type { getOpencode } from '../../lib/opencode.js'
import { formatTeamSessionError, resolveTeamSessionSettlementOutcome } from './team-session-settlement.js'
import type { ThreadManager } from './thread-manager.js'
import {
    clearParticipantCircuit,
    tripParticipantCircuit,
} from './wake-participant-state.js'
import type { WakeCascadeResult } from './wake-cascade-result.js'

export function observeWakeSessionSettlement(params: {
    oc: Awaited<ReturnType<typeof getOpencode>>
    sessionId: string
    executionDir: string
    participantKey: string
    threadId: string
    threadManager: ThreadManager
    drainAfterSettlement: () => Promise<WakeCascadeResult>
    mergeDrainResult: (result: WakeCascadeResult) => void
}) {
    const {
        oc,
        sessionId,
        executionDir,
        participantKey,
        threadId,
        threadManager,
        drainAfterSettlement,
        mergeDrainResult,
    } = params

    void resolveTeamSessionSettlementOutcome(
        oc,
        sessionId,
        executionDir,
        { timeoutMs: 30 * 60_000, pollMs: 250, requireObservedBusy: true },
    ).then((outcome) => {
        if (outcome.kind === 'timeout') {
            console.warn(`[wake-cascade] Session ${sessionId} for "${participantKey}" did not settle before timeout`)
            void threadManager.setParticipantStatus(threadId, participantKey, {
                type: 'error',
                message: outcome.message,
            }).catch(() => {})
            return drainAfterSettlement()
        }
        if (outcome.kind === 'fatal_error') {
            void threadManager.setParticipantStatus(threadId, participantKey, {
                type: 'error',
                message: outcome.message,
            }).catch(() => {})
            tripParticipantCircuit(threadId, participantKey, outcome.message)
            console.warn(
                `[wake-cascade] Opened circuit for "${participantKey}" after non-retryable session error: ${outcome.message}`,
            )
            return drainAfterSettlement()
        }

        void threadManager.setParticipantStatus(threadId, participantKey, { type: 'idle' }).catch(() => {})
        clearParticipantCircuit(threadId, participantKey)
        return drainAfterSettlement()
    }).then((drainResult) => {
        if (!drainResult) {
            return
        }
        mergeDrainResult(drainResult)
    }).catch((error) => {
        console.error(`[wake-cascade] Failed waiting for session settle for "${participantKey}":`, error)
        void threadManager.setParticipantStatus(threadId, participantKey, {
            type: 'error',
            message: formatTeamSessionError(error),
        }).catch(() => {})
        void drainAfterSettlement()
    })
}
