import type {
    TeamRuntimeDeleteResponse,
    TeamRuntimeErrorResponse,
} from '../../../shared/team-types.js'
import type { TeamRuntimeActorSystem } from './team-runtime-actors.js'
import type { ThreadManager } from './thread-manager.js'
import type { WakeConditionAlarmScheduler } from './wake-condition-alarms.js'
import { deleteLinkedOpenCodeSessions } from './linked-session-cleanup.js'
import { teamRuntimeError } from './team-runtime-results.js'

export async function deleteRuntimeThread(params: {
    workingDir: string
    threadId: string
    threadManager: ThreadManager
    actorSystem: TeamRuntimeActorSystem
    wakeConditionAlarms: WakeConditionAlarmScheduler
}): Promise<TeamRuntimeDeleteResponse | TeamRuntimeErrorResponse> {
    const {
        workingDir,
        threadId,
        threadManager,
        actorSystem,
        wakeConditionAlarms,
    } = params

    wakeConditionAlarms.clearThread(threadId)
    const result = await threadManager.deleteThread(threadId)
    if (!result.deleted) {
        return teamRuntimeError(`Thread ${threadId} not found`, 404)
    }
    actorSystem.deleteThread(threadId)
    await deleteLinkedOpenCodeSessions({
        workingDir,
        sessionIds: result.sessionIds,
    })
    return { ok: true as const }
}

export async function deleteRuntimeTeam(params: {
    workingDir: string
    teamId: string
    threadManager: ThreadManager
    actorSystem: TeamRuntimeActorSystem
    wakeConditionAlarms: WakeConditionAlarmScheduler
}): Promise<TeamRuntimeDeleteResponse> {
    const {
        workingDir,
        teamId,
        threadManager,
        actorSystem,
        wakeConditionAlarms,
    } = params

    const threadIds = threadManager.listThreadIds(teamId)
    for (const threadId of threadIds) {
        wakeConditionAlarms.clearThread(threadId)
        const result = await threadManager.deleteThread(threadId)
        if (!result.deleted) {
            continue
        }
        actorSystem.deleteThread(threadId)
        await deleteLinkedOpenCodeSessions({
            workingDir,
            sessionIds: result.sessionIds,
        })
    }
    return { ok: true as const }
}
