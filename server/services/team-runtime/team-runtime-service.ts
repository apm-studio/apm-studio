import type {
    TeamDefinition,
    TeamListBoardRequest,
    TeamBoardEntriesResponse,
    TeamBoardEntryResponse,
    TeamPostToBoardResponse,
    TeamPostToBoardRequest,
    TeamRuntimeDeleteResponse,
    TeamRuntimeErrorResponse,
    TeamReadBoardRequest,
    TeamSendMessageRequest,
    TeamSendMessageResponse,
    TeamSetWakeConditionRequest,
    TeamThreadsResponse,
    TeamThreadCreateResponse,
    TeamThreadEventsResponse,
    TeamThreadResponse,
    TeamWakeConditionResponse,
} from '../../../shared/team-types.js'
import { SafetyGuard } from './safety-guard.js'
import { ThreadManager } from './thread-manager.js'
import { workspaceIdForDir } from '../../lib/config.js'
import { serverDebug } from '../../lib/server-logger.js'
import { TeamRuntimeActorSystem } from './team-runtime-actors.js'
import { WakeConditionAlarmScheduler } from './wake-condition-alarms.js'
import { WakeCascadeDispatcher } from './wake-cascade-dispatcher.js'
import { TeamRuntimeRecoveryCoordinator } from './team-runtime-recovery.js'
import { TeamRuntimeWakeConditionCoordinator } from './team-runtime-wake-conditions.js'
import { TeamRuntimeParticipantCoordinator } from './team-runtime-participants.js'
import { deleteRuntimeTeam, deleteRuntimeThread } from './team-runtime-deletion.js'
import { sendTeamRuntimeMessage } from './team-runtime-message-commands.js'
import {
    getTeamRuntimeBoardEntry,
    listTeamRuntimeBoardEntries,
    postTeamRuntimeBoardEntry,
    readTeamRuntimeBoard,
} from './team-runtime-board-commands.js'
import {
    createTeamRuntimeThread,
    getTeamRuntimeThread,
    getTeamRuntimeThreadEvents,
    listTeamRuntimeThreads,
    renameTeamRuntimeThread,
    syncTeamRuntimeDefinition,
} from './team-runtime-thread-commands.js'

class TeamRuntimeService {
    private readonly threadManager: ThreadManager
    private readonly workingDir: string
    private readonly actorSystem: TeamRuntimeActorSystem
    private readonly wakeConditionAlarms: WakeConditionAlarmScheduler
    private readonly wakeCascadeDispatcher: WakeCascadeDispatcher
    private readonly runtimeRecovery: TeamRuntimeRecoveryCoordinator
    private readonly wakeConditions: TeamRuntimeWakeConditionCoordinator
    private readonly participants: TeamRuntimeParticipantCoordinator
    private readonly safetyGuards = new Map<string, SafetyGuard>()
    private _threadsLoaded = false

    constructor(workspaceId: string, workingDir: string) {
        this.workingDir = workingDir
        this.threadManager = new ThreadManager(workspaceId, workingDir)
        this.actorSystem = new TeamRuntimeActorSystem()
        this.wakeConditionAlarms = new WakeConditionAlarmScheduler({
            actorSystem: this.actorSystem,
            getTeamDefinition: (threadId) => this.threadManager.getTeamDefinition(threadId),
            onAlarm: (threadId, condition) => this.wakeConditions.handleAlarm(threadId, condition),
        })
        this.wakeConditions = new TeamRuntimeWakeConditionCoordinator({
            workingDir: this.workingDir,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
            wakeConditionAlarms: this.wakeConditionAlarms,
            syncParticipantActors: (threadId) => this.syncParticipantActorsFromThread(threadId),
        })
        this.participants = new TeamRuntimeParticipantCoordinator({
            workingDir: this.workingDir,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
            syncParticipantActors: (threadId) => this.syncParticipantActorsFromThread(threadId),
        })
        this.runtimeRecovery = new TeamRuntimeRecoveryCoordinator({
            workingDir: this.workingDir,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
            wakeConditionAlarms: this.wakeConditionAlarms,
        })
        this.wakeCascadeDispatcher = new WakeCascadeDispatcher({
            workingDir: this.workingDir,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
            syncParticipantActors: (threadId) => this.syncParticipantActorsFromThread(threadId),
        })
    }

    /** Lazy-load persisted threads on first access */
    private async ensureThreadsLoaded(): Promise<void> {
        if (this._threadsLoaded) return
        this._threadsLoaded = true
        serverDebug('team-runtime', `Loading persisted threads for workspace ${this.workingDir}`)
        await this.threadManager.loadPersistedThreads()
        await this.runtimeRecovery.recoverLoadedThreads()
        serverDebug('team-runtime', `Loaded ${this.threadManager.getActiveThreadCount()} threads`)
    }

    private getSafetyGuard(threadId: string): SafetyGuard {
        if (!this.safetyGuards.has(threadId)) {
            const teamDef = this.threadManager.getTeamDefinition(threadId)
            this.safetyGuards.set(threadId, SafetyGuard.fromTeamSafety(teamDef?.safety))
        }
        return this.safetyGuards.get(threadId)!
    }

    private syncParticipantActorsFromThread(threadId: string) {
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return
        }
        for (const [participantKey, status] of Object.entries(runtime.thread.participantStatuses || {})) {
            this.actorSystem.syncParticipantStatus(threadId, participantKey, status)
        }
    }

    async sendMessage(
        threadId: string,
        body: TeamSendMessageRequest,
    ): Promise<TeamSendMessageResponse | TeamRuntimeErrorResponse> {
        await this.ensureThreadsLoaded()
        return sendTeamRuntimeMessage({
            threadId,
            body,
            threadManager: this.threadManager,
            wakeCascadeDispatcher: this.wakeCascadeDispatcher,
            getSafetyGuard: (targetThreadId) => this.getSafetyGuard(targetThreadId),
        })
    }

    async postToBoard(
        threadId: string,
        body: TeamPostToBoardRequest,
    ): Promise<TeamPostToBoardResponse | TeamRuntimeErrorResponse> {
        await this.ensureThreadsLoaded()
        return postTeamRuntimeBoardEntry({
            threadId,
            body,
            threadManager: this.threadManager,
            wakeCascadeDispatcher: this.wakeCascadeDispatcher,
            getSafetyGuard: (targetThreadId) => this.getSafetyGuard(targetThreadId),
        })
    }

    async listBoard(
        threadId: string,
        input: TeamListBoardRequest = {},
    ): Promise<TeamBoardEntriesResponse | TeamRuntimeErrorResponse> {
        await this.ensureThreadsLoaded()
        return listTeamRuntimeBoardEntries({
            threadId,
            input,
            threadManager: this.threadManager,
        })
    }

    async getBoardEntry(
        threadId: string,
        key: string,
    ): Promise<TeamBoardEntryResponse | TeamRuntimeErrorResponse> {
        await this.ensureThreadsLoaded()
        return getTeamRuntimeBoardEntry({
            threadId,
            key,
            threadManager: this.threadManager,
        })
    }

    async readBoard(
        threadId: string,
        input: TeamReadBoardRequest = {},
    ): Promise<TeamBoardEntriesResponse | TeamRuntimeErrorResponse> {
        await this.ensureThreadsLoaded()
        return readTeamRuntimeBoard({
            threadId,
            input,
            threadManager: this.threadManager,
        })
    }

    async syncTeamDefinition(teamId: string, teamDefinition: TeamDefinition): Promise<TeamThreadsResponse> {
        await this.ensureThreadsLoaded()
        return syncTeamRuntimeDefinition({
            workingDir: this.workingDir,
            teamId,
            teamDefinition,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
            clearSafetyGuard: (threadId) => {
                this.safetyGuards.delete(threadId)
            },
        })
    }

    async setWakeCondition(
        threadId: string,
        body: TeamSetWakeConditionRequest,
    ): Promise<TeamWakeConditionResponse | TeamRuntimeErrorResponse> {
        await this.ensureThreadsLoaded()
        return this.wakeConditions.setCondition(threadId, body)
    }

    async createThread(teamId: string, teamDefinition?: TeamDefinition): Promise<TeamThreadCreateResponse> {
        return createTeamRuntimeThread({
            workingDir: this.workingDir,
            teamId,
            teamDefinition,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
        })
    }

    async renameThread(
        _teamId: string,
        threadId: string,
        name: string,
        options?: { ifUnset?: boolean },
    ): Promise<TeamThreadResponse | TeamRuntimeErrorResponse> {
        await this.ensureThreadsLoaded()
        return renameTeamRuntimeThread({
            threadId,
            name,
            options,
            threadManager: this.threadManager,
        })
    }

    async getTeamDefinition(threadId: string) {
        await this.ensureThreadsLoaded()
        return this.threadManager.getTeamDefinition(threadId)
    }

    async listThreads(teamId: string): Promise<TeamThreadsResponse> {
        await this.ensureThreadsLoaded()
        return listTeamRuntimeThreads({
            teamId,
            threadManager: this.threadManager,
        })
    }

    async deleteThread(_teamId: string, threadId: string): Promise<TeamRuntimeDeleteResponse | TeamRuntimeErrorResponse> {
        return deleteRuntimeThread({
            workingDir: this.workingDir,
            threadId,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
            wakeConditionAlarms: this.wakeConditionAlarms,
        })
    }

    async deleteTeam(teamId: string): Promise<TeamRuntimeDeleteResponse> {
        await this.ensureThreadsLoaded()
        return deleteRuntimeTeam({
            workingDir: this.workingDir,
            teamId,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
            wakeConditionAlarms: this.wakeConditionAlarms,
        })
    }

    async getThread(threadId: string): Promise<TeamThreadResponse | TeamRuntimeErrorResponse> {
        await this.ensureThreadsLoaded()
        return getTeamRuntimeThread({
            threadId,
            threadManager: this.threadManager,
        })
    }

    async getRecentEvents(threadId: string, count = 50, before = 0): Promise<TeamThreadEventsResponse> {
        await this.ensureThreadsLoaded()
        return getTeamRuntimeThreadEvents({
            threadId,
            count,
            before,
            threadManager: this.threadManager,
        })
    }

    async registerParticipantSession(threadId: string, participantKey: string, sessionId: string) {
        await this.ensureThreadsLoaded()
        await this.participants.registerSession(threadId, participantKey, sessionId)
    }

    async beginUserTurn(threadId: string) {
        await this.ensureThreadsLoaded()
        this.getSafetyGuard(threadId).reset(Date.now())
    }

    async markParticipantSessionBusy(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        await this.participants.markSessionBusy(threadId, participantKey)
    }

    async clearParticipantSessionBusy(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        await this.participants.clearSessionBusy(threadId, participantKey)
    }

    async setParticipantSessionStatus(
        threadId: string,
        participantKey: string,
        status: { type: 'idle' | 'busy' | 'retry' | 'error'; message?: string },
    ) {
        await this.ensureThreadsLoaded()
        await this.participants.setSessionStatus(threadId, participantKey, status)
    }

    async tripParticipantAutoWakeCircuit(threadId: string, participantKey: string, reason: string) {
        await this.ensureThreadsLoaded()
        this.participants.tripAutoWakeCircuit(threadId, participantKey, reason)
    }

    async clearParticipantAutoWakeCircuit(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        this.participants.clearAutoWakeCircuit(threadId, participantKey)
    }

    async drainParticipantQueue(threadId: string, participantKey: string) {
        await this.ensureThreadsLoaded()
        await this.participants.drainQueue(threadId, participantKey)
    }

}

const runtimeServices = new Map<string, TeamRuntimeService>()

export function getTeamRuntimeService(workingDir: string): TeamRuntimeService {
    const workspaceId = workspaceIdForDir(workingDir)
    let service = runtimeServices.get(workspaceId)
    if (!service) {
        service = new TeamRuntimeService(workspaceId, workingDir)
        runtimeServices.set(workspaceId, service)
    }
    return service
}

export async function getTeamDefinitionForThread(workingDir: string, threadId: string) {
    return getTeamRuntimeService(workingDir).getTeamDefinition(threadId)
}
