import type { ConditionExpr, TeamDefinition, WakeCondition } from '../../../shared/team-types.js'
import type { TeamRuntimeActorSystem } from './team-runtime-actors.js'

const MAX_WAKE_CONDITION_ALARM_DELAY_MS = 2_147_483_647

type WakeConditionActorControls = Pick<
    TeamRuntimeActorSystem,
    'clearWakeCondition' | 'scheduleWakeCondition'
>

export class WakeConditionAlarmScheduler {
    private readonly alarms = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly actorSystem: WakeConditionActorControls
    private readonly getTeamDefinition: (threadId: string) => TeamDefinition | null | undefined
    private readonly onAlarm: (threadId: string, condition: WakeCondition) => Promise<void>

    constructor(params: {
        actorSystem: WakeConditionActorControls
        getTeamDefinition: (threadId: string) => TeamDefinition | null | undefined
        onAlarm: (threadId: string, condition: WakeCondition) => Promise<void>
    }) {
        this.actorSystem = params.actorSystem
        this.getTeamDefinition = params.getTeamDefinition
        this.onAlarm = params.onAlarm
    }

    clearCondition(threadId: string, conditionId: string) {
        const alarmKey = this.alarmKey(threadId, conditionId)
        const alarm = this.alarms.get(alarmKey)
        if (alarm) {
            clearTimeout(alarm)
            this.alarms.delete(alarmKey)
        }
        this.actorSystem.clearWakeCondition(threadId, conditionId, this.getTeamDefinition(threadId) || undefined)
    }

    clearThread(threadId: string) {
        for (const alarmKey of Array.from(this.alarms.keys())) {
            if (!alarmKey.startsWith(`${threadId}:`)) {
                continue
            }
            const alarm = this.alarms.get(alarmKey)
            if (alarm) {
                clearTimeout(alarm)
            }
            this.alarms.delete(alarmKey)
        }
    }

    schedule(threadId: string, condition: WakeCondition) {
        this.clearCondition(threadId, condition.id)
        if (condition.status !== 'waiting') {
            return
        }

        const now = Date.now()
        const nextAt = nextWakeConditionAlarmAt(condition.condition, now)
        if (typeof nextAt !== 'number') {
            return
        }

        const delay = Math.max(0, Math.min(nextAt - now, MAX_WAKE_CONDITION_ALARM_DELAY_MS))
        this.actorSystem.scheduleWakeCondition(threadId, condition.id, this.getTeamDefinition(threadId) || undefined)
        const alarm = setTimeout(() => {
            this.alarms.delete(this.alarmKey(threadId, condition.id))
            void this.onAlarm(threadId, condition).catch((error) => {
                console.error('[team-runtime] Wake condition alarm error:', error)
            })
        }, delay)
        this.alarms.set(this.alarmKey(threadId, condition.id), alarm)
    }

    private alarmKey(threadId: string, conditionId: string) {
        return `${threadId}:${conditionId}`
    }
}

function nextWakeConditionAlarmAt(condition: ConditionExpr, now: number): number | null {
    switch (condition.type) {
        case 'wake_at':
            return condition.at > now ? condition.at : null
        case 'all_of':
        case 'any_of': {
            const candidates = condition.conditions
                .map((sub) => nextWakeConditionAlarmAt(sub, now))
                .filter((value): value is number => typeof value === 'number')
                .sort((left, right) => left - right)
            return candidates[0] ?? null
        }
        default:
            return null
    }
}
