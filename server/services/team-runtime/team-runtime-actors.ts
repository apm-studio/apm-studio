import { createActor, fromTransition } from 'xstate'
import type { TeamDefinition, TeamParticipantSessionStatus } from '../../../shared/team-types.js'

export type TeamThreadPhase = 'bootstrapping' | 'recovering' | 'active' | 'deleted'
export type TeamParticipantPhase =
    | 'idle'
    | 'queued'
    | 'waking'
    | 'running'
    | 'parked'
    | 'blocked_retry'
    | 'error'
    | 'circuit_open'

export type TeamThreadRuntimeState = {
    threadId: string
    phase: TeamThreadPhase
    scheduledWakeConditionIds: string[]
    participantKeys: string[]
}

export type TeamParticipantRuntimeState = {
    threadId: string
    participantKey: string
    phase: TeamParticipantPhase
    queueDepth: number
    circuitReason: string | null
    lastStatus: TeamParticipantSessionStatus | null
}

type ThreadEvent =
    | { type: 'RECOVER' }
    | { type: 'ACTIVATE' }
    | { type: 'DELETE' }
    | { type: 'SCHEDULE_WAKE_CONDITION'; conditionId: string }
    | { type: 'CLEAR_WAKE_CONDITION'; conditionId: string }
    | { type: 'SYNC_PARTICIPANTS'; participantKeys: string[] }

type ParticipantEvent =
    | { type: 'SYNC_STATUS'; status: TeamParticipantSessionStatus | null }
    | { type: 'QUEUE'; queueDepth?: number }
    | { type: 'WAKING' }
    | { type: 'CLEAR_QUEUE' }
    | { type: 'CIRCUIT_OPEN'; reason: string }
    | { type: 'CIRCUIT_CLEARED' }

function createThreadActor(threadId: string) {
    const initialState: TeamThreadRuntimeState = {
        threadId,
        phase: 'bootstrapping',
        scheduledWakeConditionIds: [],
        participantKeys: [],
    }

    return createActor(fromTransition((state: TeamThreadRuntimeState, event: ThreadEvent) => {
        switch (event.type) {
            case 'RECOVER':
                return { ...state, phase: 'recovering' as const }
            case 'ACTIVATE':
                return { ...state, phase: 'active' as const }
            case 'DELETE':
                return { ...state, phase: 'deleted' as const, scheduledWakeConditionIds: [] }
            case 'SCHEDULE_WAKE_CONDITION':
                return state.scheduledWakeConditionIds.includes(event.conditionId)
                    ? state
                    : {
                        ...state,
                        scheduledWakeConditionIds: [...state.scheduledWakeConditionIds, event.conditionId],
                    }
            case 'CLEAR_WAKE_CONDITION':
                return {
                    ...state,
                    scheduledWakeConditionIds: state.scheduledWakeConditionIds.filter((id) => id !== event.conditionId),
                }
            case 'SYNC_PARTICIPANTS':
                return {
                    ...state,
                    participantKeys: [...event.participantKeys],
                }
            default:
                return state
        }
    }, initialState))
}

function deriveParticipantPhase(state: Omit<TeamParticipantRuntimeState, 'phase'>): TeamParticipantPhase {
    if (state.circuitReason) {
        return 'circuit_open'
    }
    if (state.lastStatus?.type === 'retry') {
        return 'blocked_retry'
    }
    if (state.lastStatus?.type === 'error') {
        return 'error'
    }
    if (state.lastStatus?.type === 'busy') {
        return state.queueDepth > 0 ? 'waking' : 'running'
    }
    if (state.queueDepth > 0) {
        return 'queued'
    }
    return 'idle'
}

function withParticipantPhase(state: Omit<TeamParticipantRuntimeState, 'phase'>): TeamParticipantRuntimeState {
    return {
        ...state,
        phase: deriveParticipantPhase(state),
    }
}

function createParticipantActor(threadId: string, participantKey: string) {
    const initialState = withParticipantPhase({
        threadId,
        participantKey,
        queueDepth: 0,
        circuitReason: null,
        lastStatus: null,
    })

    return createActor(fromTransition((state: TeamParticipantRuntimeState, event: ParticipantEvent) => {
        switch (event.type) {
            case 'SYNC_STATUS':
                return withParticipantPhase({
                    ...state,
                    lastStatus: event.status,
                })
            case 'QUEUE':
                return withParticipantPhase({
                    ...state,
                    queueDepth: event.queueDepth ?? Math.max(1, state.queueDepth + 1),
                })
            case 'WAKING':
                return withParticipantPhase({
                    ...state,
                    lastStatus: { type: 'busy', updatedAt: Date.now() },
                })
            case 'CLEAR_QUEUE':
                return withParticipantPhase({
                    ...state,
                    queueDepth: 0,
                })
            case 'CIRCUIT_OPEN':
                return withParticipantPhase({
                    ...state,
                    circuitReason: event.reason,
                })
            case 'CIRCUIT_CLEARED':
                return withParticipantPhase({
                    ...state,
                    circuitReason: null,
                })
            default:
                return state
        }
    }, initialState))
}

export class TeamRuntimeActorSystem {
    private readonly threadActors = new Map<string, ReturnType<typeof createThreadActor>>()
    private readonly participantActors = new Map<string, ReturnType<typeof createParticipantActor>>()

    ensureThread(threadId: string, teamDefinition?: TeamDefinition) {
        let actor = this.threadActors.get(threadId)
        if (!actor) {
            const created = createThreadActor(threadId)
            created.start()
            this.threadActors.set(threadId, created)
            actor = created
        }
        actor.send({ type: 'SYNC_PARTICIPANTS', participantKeys: Object.keys(teamDefinition?.participants || {}) })
        return actor
    }

    ensureParticipant(threadId: string, participantKey: string) {
        const actorKey = `${threadId}:${participantKey}`
        let actor = this.participantActors.get(actorKey)
        if (!actor) {
            const created = createParticipantActor(threadId, participantKey)
            created.start()
            this.participantActors.set(actorKey, created)
            actor = created
        }
        return actor
    }

    markThreadRecovering(threadId: string, teamDefinition?: TeamDefinition) {
        this.ensureThread(threadId, teamDefinition).send({ type: 'RECOVER' })
    }

    markThreadActive(threadId: string, teamDefinition?: TeamDefinition) {
        this.ensureThread(threadId, teamDefinition).send({ type: 'ACTIVATE' })
    }

    deleteThread(threadId: string) {
        const threadActor = this.threadActors.get(threadId)
        if (threadActor) {
            threadActor.send({ type: 'DELETE' })
            threadActor.stop()
            this.threadActors.delete(threadId)
        }
        for (const [key, actor] of this.participantActors.entries()) {
            if (!key.startsWith(`${threadId}:`)) {
                continue
            }
            actor.stop()
            this.participantActors.delete(key)
        }
    }

    scheduleWakeCondition(threadId: string, conditionId: string, teamDefinition?: TeamDefinition) {
        this.ensureThread(threadId, teamDefinition).send({
            type: 'SCHEDULE_WAKE_CONDITION',
            conditionId,
        })
    }

    clearWakeCondition(threadId: string, conditionId: string, teamDefinition?: TeamDefinition) {
        this.ensureThread(threadId, teamDefinition).send({
            type: 'CLEAR_WAKE_CONDITION',
            conditionId,
        })
    }

    syncParticipantStatus(threadId: string, participantKey: string, status: TeamParticipantSessionStatus | null) {
        this.ensureParticipant(threadId, participantKey).send({
            type: 'SYNC_STATUS',
            status,
        })
    }

    queueParticipant(threadId: string, participantKey: string, queueDepth?: number) {
        this.ensureParticipant(threadId, participantKey).send({
            type: 'QUEUE',
            queueDepth,
        })
    }

    markParticipantWaking(threadId: string, participantKey: string) {
        this.ensureParticipant(threadId, participantKey).send({ type: 'WAKING' })
    }

    clearParticipantQueue(threadId: string, participantKey: string) {
        this.ensureParticipant(threadId, participantKey).send({ type: 'CLEAR_QUEUE' })
    }

    openParticipantCircuit(threadId: string, participantKey: string, reason: string) {
        this.ensureParticipant(threadId, participantKey).send({
            type: 'CIRCUIT_OPEN',
            reason,
        })
    }

    clearParticipantCircuit(threadId: string, participantKey: string) {
        this.ensureParticipant(threadId, participantKey).send({ type: 'CIRCUIT_CLEARED' })
    }
}
