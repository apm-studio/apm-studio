import type { TeamParticipantSessionStatus } from '../../../shared/team-types.js'
import type { TeamRuntimeActorSystem } from './team-runtime-actors.js'
import type { ThreadManager } from './thread-manager.js'
import { drainParticipantQueueAfterSettlement } from './wake-cascade.js'
import {
    clearParticipantCircuit,
    clearParticipantQueueRunning,
    markParticipantQueueRunning,
    tripParticipantCircuit,
} from './wake-participant-state.js'

type ParticipantStatusPatch = Pick<TeamParticipantSessionStatus, 'type' | 'message'>

export class TeamRuntimeParticipantCoordinator {
    private readonly workingDir: string
    private readonly threadManager: ThreadManager
    private readonly actorSystem: TeamRuntimeActorSystem
    private readonly syncParticipantActors: (threadId: string) => void

    constructor(params: {
        workingDir: string
        threadManager: ThreadManager
        actorSystem: TeamRuntimeActorSystem
        syncParticipantActors: (threadId: string) => void
    }) {
        this.workingDir = params.workingDir
        this.threadManager = params.threadManager
        this.actorSystem = params.actorSystem
        this.syncParticipantActors = params.syncParticipantActors
    }

    async registerSession(threadId: string, participantKey: string, sessionId: string) {
        await this.threadManager.getOrCreateSession(threadId, participantKey, () => sessionId)
        this.actorSystem.ensureParticipant(threadId, participantKey)
    }

    async markSessionBusy(threadId: string, participantKey: string) {
        markParticipantQueueRunning(threadId, participantKey)
        await this.threadManager.setParticipantStatus(threadId, participantKey, { type: 'busy' })
        this.actorSystem.markParticipantWaking(threadId, participantKey)
        this.syncParticipantActors(threadId)
    }

    async clearSessionBusy(threadId: string, participantKey: string) {
        clearParticipantQueueRunning(threadId, participantKey)
        await this.threadManager.setParticipantStatus(threadId, participantKey, { type: 'idle' })
        this.actorSystem.clearParticipantQueue(threadId, participantKey)
        this.syncParticipantActors(threadId)
    }

    async setSessionStatus(
        threadId: string,
        participantKey: string,
        status: ParticipantStatusPatch,
    ) {
        await this.threadManager.setParticipantStatus(threadId, participantKey, status)
        if (status.type === 'idle') {
            this.actorSystem.clearParticipantQueue(threadId, participantKey)
            this.actorSystem.clearParticipantCircuit(threadId, participantKey)
        } else if (status.type === 'retry') {
            this.actorSystem.queueParticipant(threadId, participantKey)
        }
        this.syncParticipantActors(threadId)
    }

    tripAutoWakeCircuit(threadId: string, participantKey: string, reason: string) {
        tripParticipantCircuit(threadId, participantKey, reason)
        this.actorSystem.openParticipantCircuit(threadId, participantKey, reason)
    }

    clearAutoWakeCircuit(threadId: string, participantKey: string) {
        clearParticipantCircuit(threadId, participantKey)
        this.actorSystem.clearParticipantCircuit(threadId, participantKey)
    }

    async drainQueue(threadId: string, participantKey: string) {
        const runtime = this.threadManager.getThreadRuntime(threadId)
        const teamDefinition = this.threadManager.getTeamDefinition(threadId)
        if (!runtime || !teamDefinition) {
            return
        }
        await drainParticipantQueueAfterSettlement(
            participantKey,
            teamDefinition,
            runtime.mailbox,
            this.threadManager,
            threadId,
            this.workingDir,
        )
        this.actorSystem.clearParticipantQueue(threadId, participantKey)
        this.syncParticipantActors(threadId)
    }
}
