import type {
    MailboxEvent,
    TeamDefinition,
} from '../../../shared/team-types.js'
import type { TeamRuntimeActorSystem } from './team-runtime-actors.js'
import type { ThreadManager } from './thread-manager.js'
import type { WakeConditionAlarmScheduler } from './wake-condition-alarms.js'
import {
    BLOCKED_PROJECTION_RETRY_MESSAGE,
    processWakeTargets,
} from './wake-cascade.js'
import { evaluateWakeCondition } from './wake-evaluator.js'
import { buildRecoverableWakeTarget } from './wake-recovery.js'
import { reconcileLoadedParticipantStatuses } from './participant-status-reconciliation.js'
import { createWakeConditionTriggerTarget } from './wake-condition-events.js'

export class TeamRuntimeRecoveryCoordinator {
    private readonly workingDir: string
    private readonly threadManager: ThreadManager
    private readonly actorSystem: TeamRuntimeActorSystem
    private readonly wakeConditionAlarms: WakeConditionAlarmScheduler
    private readonly blockedWakeRecoveryInFlight = new Set<string>()

    constructor(params: {
        workingDir: string
        threadManager: ThreadManager
        actorSystem: TeamRuntimeActorSystem
        wakeConditionAlarms: WakeConditionAlarmScheduler
    }) {
        this.workingDir = params.workingDir
        this.threadManager = params.threadManager
        this.actorSystem = params.actorSystem
        this.wakeConditionAlarms = params.wakeConditionAlarms
    }

    async recoverLoadedThreads() {
        await reconcileLoadedParticipantStatuses({
            workingDir: this.workingDir,
            threadManager: this.threadManager,
            actorSystem: this.actorSystem,
        })

        for (const threadId of this.threadManager.listLoadedThreadIds()) {
            const runtime = this.threadManager.getThreadRuntime(threadId)
            const teamDefinition = this.threadManager.getTeamDefinition(threadId)
            if (!runtime || !teamDefinition) {
                continue
            }
            this.actorSystem.markThreadRecovering(threadId, teamDefinition)

            const recentEvents = await this.threadManager.getRecentEvents(threadId, 50)

            for (const condition of runtime.mailbox.getWakeConditions()) {
                if (evaluateWakeCondition(condition, runtime.mailbox.getBoardMap(), recentEvents, teamDefinition)) {
                    condition.status = 'triggered'
                    await processWakeTargets(
                        [createWakeConditionTriggerTarget({
                            threadId,
                            participantKey: condition.createdBy,
                            condition,
                        })],
                        teamDefinition,
                        runtime.mailbox,
                        this.threadManager,
                        threadId,
                        this.workingDir,
                    )
                    continue
                }

                this.wakeConditionAlarms.schedule(threadId, condition)
            }

            for (const [participantKey, status] of Object.entries(runtime.thread.participantStatuses || {})) {
                this.actorSystem.syncParticipantStatus(threadId, participantKey, status)
                if (status.type !== 'retry' || status.message !== BLOCKED_PROJECTION_RETRY_MESSAGE) {
                    continue
                }
                await this.recoverBlockedParticipantWake({
                    threadId,
                    participantKey,
                    statusUpdatedAt: status.updatedAt,
                    teamDefinition,
                    recentEvents,
                })
            }
            this.actorSystem.markThreadActive(threadId, teamDefinition)
        }
    }

    private async recoverBlockedParticipantWake(params: {
        threadId: string
        participantKey: string
        statusUpdatedAt?: number
        teamDefinition: TeamDefinition
        recentEvents: MailboxEvent[]
    }) {
        const {
            threadId,
            participantKey,
            statusUpdatedAt,
            teamDefinition,
            recentEvents,
        } = params
        const recoveryKey = `${threadId}:${participantKey}`
        if (this.blockedWakeRecoveryInFlight.has(recoveryKey)) {
            return
        }

        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return
        }

        const triggeredCondition = runtime.mailbox.getWakeConditionsForParticipant(participantKey, {
            statuses: ['triggered'],
        })[0] || null
        const target = buildRecoverableWakeTarget({
            participantKey,
            teamDefinition,
            threadId,
            recentEvents,
            updatedAt: statusUpdatedAt,
            triggeredCondition,
        })
        if (!target) {
            return
        }

        this.blockedWakeRecoveryInFlight.add(recoveryKey)
        try {
            this.actorSystem.queueParticipant(threadId, participantKey)
            await processWakeTargets(
                [target],
                teamDefinition,
                runtime.mailbox,
                this.threadManager,
                threadId,
                this.workingDir,
            )
            this.syncParticipantActorsFromThread(threadId)
        } finally {
            this.blockedWakeRecoveryInFlight.delete(recoveryKey)
        }
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
}
