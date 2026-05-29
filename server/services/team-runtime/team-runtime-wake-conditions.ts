import type {
    TeamRuntimeErrorResponse,
    TeamSetWakeConditionRequest,
    TeamWakeConditionResponse,
    WakeCondition,
} from '../../../shared/team-types.js'
import type { TeamRuntimeActorSystem } from './team-runtime-actors.js'
import type { ThreadManager } from './thread-manager.js'
import type { WakeConditionAlarmScheduler } from './wake-condition-alarms.js'
import { processWakeTargets } from './wake-cascade.js'
import { createWakeConditionTriggerTarget } from './wake-condition-events.js'
import { validateConditionExpr } from './wake-condition-validator.js'
import { evaluateWakeCondition } from './wake-evaluator.js'
import { teamRuntimeError } from './team-runtime-results.js'

export class TeamRuntimeWakeConditionCoordinator {
    private readonly workingDir: string
    private readonly threadManager: ThreadManager
    private readonly actorSystem: TeamRuntimeActorSystem
    private readonly wakeConditionAlarms: WakeConditionAlarmScheduler
    private readonly syncParticipantActors: (threadId: string) => void

    constructor(params: {
        workingDir: string
        threadManager: ThreadManager
        actorSystem: TeamRuntimeActorSystem
        wakeConditionAlarms: WakeConditionAlarmScheduler
        syncParticipantActors: (threadId: string) => void
    }) {
        this.workingDir = params.workingDir
        this.threadManager = params.threadManager
        this.actorSystem = params.actorSystem
        this.wakeConditionAlarms = params.wakeConditionAlarms
        this.syncParticipantActors = params.syncParticipantActors
    }

    async handleAlarm(threadId: string, condition: WakeCondition) {
        const runtime = this.threadManager.getThreadRuntime(threadId)
        const teamDefinition = this.threadManager.getTeamDefinition(threadId)
        if (!runtime || !teamDefinition || condition.status !== 'waiting') {
            return
        }

        const recentEvents = await this.threadManager.getRecentEvents(threadId, 20)
        if (!evaluateWakeCondition(condition, runtime.mailbox.getBoardMap(), recentEvents, teamDefinition)) {
            this.wakeConditionAlarms.schedule(threadId, condition)
            return
        }

        condition.status = 'triggered'
        this.actorSystem.clearWakeCondition(threadId, condition.id, teamDefinition)
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
        this.syncParticipantActors(threadId)
    }

    async setCondition(
        threadId: string,
        body: TeamSetWakeConditionRequest,
    ): Promise<TeamWakeConditionResponse | TeamRuntimeErrorResponse> {
        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            return teamRuntimeError(`Thread ${threadId} not found`, 404)
        }

        const validatedCondition = validateConditionExpr(body.condition)
        if (!validatedCondition.ok) {
            return teamRuntimeError(validatedCondition.error, 400)
        }

        const teamDefinition = this.threadManager.getTeamDefinition(threadId)

        const replacedConditions = runtime.mailbox.removeWakeConditionsForParticipant(body.createdBy)
        for (const condition of replacedConditions) {
            this.wakeConditionAlarms.clearCondition(threadId, condition.id)
        }

        const wakeCondition = runtime.mailbox.addWakeCondition({
            target: body.target,
            createdBy: body.createdBy,
            onSatisfiedMessage: body.onSatisfiedMessage,
            condition: validatedCondition.value,
        })

        if (teamDefinition) {
            const recentEvents = await this.threadManager.getRecentEvents(threadId, 20)
            if (evaluateWakeCondition(wakeCondition, runtime.mailbox.getBoardMap(), recentEvents, teamDefinition)) {
                wakeCondition.status = 'triggered'
                void processWakeTargets(
                    [createWakeConditionTriggerTarget({
                        threadId,
                        participantKey: wakeCondition.createdBy,
                        condition: wakeCondition,
                    })],
                    teamDefinition,
                    runtime.mailbox,
                    this.threadManager,
                    threadId,
                    this.workingDir,
                ).then(() => {
                    this.syncParticipantActors(threadId)
                }).catch((error) => {
                    console.error('[team-runtime] Immediate wake condition cascade error:', error)
                })
            } else {
                this.wakeConditionAlarms.schedule(threadId, wakeCondition)
            }
        }

        return { ok: true as const, conditionId: wakeCondition.id }
    }
}
