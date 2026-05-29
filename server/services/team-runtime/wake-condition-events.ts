import { nanoid } from 'nanoid'
import type { WakeCondition } from '../../../shared/team-types.js'
import type { WakeUpTarget } from './event-router.js'

export function createWakeConditionTriggerTarget(params: {
    threadId: string
    participantKey: string
    condition: WakeCondition
}): WakeUpTarget {
    const { threadId, participantKey, condition } = params
    return {
        participantKey,
        triggerEvent: {
            id: nanoid(),
            type: 'runtime.idle',
            sourceType: 'system',
            source: 'wait_until',
            timestamp: Date.now(),
            payload: { threadId, conditionId: condition.id },
        },
        wakeCondition: condition,
        reason: 'wake-condition',
    }
}
