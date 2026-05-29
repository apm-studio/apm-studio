import { SessionQueue } from './session-queue.js'

type ParticipantCircuitState = {
    openUntil: number
    reason: string
}

const sessionQueues: Map<string, SessionQueue> = new Map()
const participantCircuits = new Map<string, Map<string, ParticipantCircuitState>>()
const blockedWakeRetries = new Map<string, Set<string>>()
const PARTICIPANT_CIRCUIT_BREAK_MS = 5 * 60_000

export function getParticipantSessionQueue(threadId: string): SessionQueue {
    if (!sessionQueues.has(threadId)) {
        sessionQueues.set(threadId, new SessionQueue())
    }
    return sessionQueues.get(threadId)!
}

export function markParticipantQueueRunning(threadId: string, participantKey: string): void {
    getParticipantSessionQueue(threadId).markRunning(participantKey)
}

export function clearParticipantQueueRunning(threadId: string, participantKey: string): void {
    getParticipantSessionQueue(threadId).clearRunning(participantKey)
}

export function participantCircuitState(threadId: string, participantKey: string) {
    const byThread = participantCircuits.get(threadId)
    const state = byThread?.get(participantKey)
    if (!state) {
        return null
    }
    if (state.openUntil <= Date.now()) {
        byThread?.delete(participantKey)
        if (byThread && byThread.size === 0) {
            participantCircuits.delete(threadId)
        }
        return null
    }
    return state
}

export function tripParticipantCircuit(threadId: string, participantKey: string, reason: string) {
    const byThread = participantCircuits.get(threadId) || new Map<string, ParticipantCircuitState>()
    byThread.set(participantKey, {
        openUntil: Date.now() + PARTICIPANT_CIRCUIT_BREAK_MS,
        reason,
    })
    participantCircuits.set(threadId, byThread)
}

export function clearParticipantCircuit(threadId: string, participantKey: string) {
    const byThread = participantCircuits.get(threadId)
    if (!byThread) {
        return
    }
    byThread.delete(participantKey)
    if (byThread.size === 0) {
        participantCircuits.delete(threadId)
    }
}

export function markBlockedWakeRetryActive(threadId: string, participantKey: string): boolean {
    const byThread = blockedWakeRetries.get(threadId) || new Set<string>()
    if (byThread.has(participantKey)) {
        blockedWakeRetries.set(threadId, byThread)
        return false
    }
    byThread.add(participantKey)
    blockedWakeRetries.set(threadId, byThread)
    return true
}

export function clearBlockedWakeRetryActive(threadId: string, participantKey: string) {
    const byThread = blockedWakeRetries.get(threadId)
    if (!byThread) {
        return
    }
    byThread.delete(participantKey)
    if (byThread.size === 0) {
        blockedWakeRetries.delete(threadId)
    }
}
