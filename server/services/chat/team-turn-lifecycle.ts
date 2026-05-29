import type { getOpencode } from '../../lib/opencode.js'
import {
    formatTeamSessionError,
    resolveTeamSessionSettlementOutcome,
} from '../team-runtime/team-session-settlement.js'
import { syncTeamParticipantStatusForSession } from '../team-runtime/team-session-runtime.js'

export interface TeamTurnRuntime {
    beginUserTurn(threadId: string): Promise<void>
    markParticipantSessionBusy(threadId: string, participantKey: string): Promise<void>
    drainParticipantQueue(threadId: string, participantKey: string): Promise<void>
    tripParticipantAutoWakeCircuit(threadId: string, participantKey: string, reason: string): void
    clearParticipantAutoWakeCircuit(threadId: string, participantKey: string): void
}

export async function syncTeamParticipantSessionFailure(sessionId: string, error: unknown) {
    await syncTeamParticipantStatusForSession(sessionId, {
        type: 'error',
        message: formatTeamSessionError(error),
    }).catch(() => {})
}

export async function beginTeamTurn(input: {
    teamRuntime: TeamTurnRuntime | null
    teamThreadId?: string
    participantKey?: string
}) {
    const {
        teamRuntime,
        teamThreadId,
        participantKey,
    } = input
    if (!teamRuntime || !teamThreadId || !participantKey) {
        return
    }
    await teamRuntime.beginUserTurn(teamThreadId)
    await teamRuntime.markParticipantSessionBusy(teamThreadId, participantKey)
}

export function scheduleTeamTurnSettlement(input: {
    oc: Awaited<ReturnType<typeof getOpencode>>
    sessionId: string
    workingDir: string
    teamRuntime: TeamTurnRuntime | null
    teamThreadId?: string
    participantKey?: string
}) {
    const {
        oc,
        sessionId,
        workingDir,
        teamRuntime,
        teamThreadId,
        participantKey,
    } = input
    if (!teamRuntime || !teamThreadId || !participantKey) {
        return
    }

    void resolveTeamSessionSettlementOutcome(
        oc,
        sessionId,
        workingDir,
        { timeoutMs: 30 * 60_000, pollMs: 250, requireObservedBusy: true },
    ).then((outcome) => {
        if (outcome.kind === 'timeout') {
            console.warn(`[chat-message-service] Session ${sessionId} for "${participantKey}" did not settle before timeout`)
            void syncTeamParticipantStatusForSession(sessionId, {
                type: 'error',
                message: outcome.message,
            }).catch(() => {})
            return teamRuntime.drainParticipantQueue(teamThreadId, participantKey)
        }

        if (outcome.kind === 'fatal_error') {
            void syncTeamParticipantStatusForSession(sessionId, {
                type: 'error',
                message: outcome.message,
            }).catch(() => {})
            void teamRuntime.tripParticipantAutoWakeCircuit(teamThreadId, participantKey, outcome.message)
            console.warn(`[chat-message-service] Opened auto-wake circuit for "${participantKey}": ${outcome.message}`)
            return teamRuntime.drainParticipantQueue(teamThreadId, participantKey)
        }

        void syncTeamParticipantStatusForSession(sessionId, { type: 'idle' }).catch(() => {})
        void teamRuntime.clearParticipantAutoWakeCircuit(teamThreadId, participantKey)
        return teamRuntime.drainParticipantQueue(teamThreadId, participantKey)
    }).catch((error) => {
        console.error(`[chat-message-service] Failed waiting for team session ${sessionId} to settle:`, error)
        void syncTeamParticipantSessionFailure(sessionId, error)
        void teamRuntime.drainParticipantQueue(teamThreadId, participantKey)
    })
}
