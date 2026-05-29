import { nanoid } from 'nanoid'
import type {
    MailboxEvent,
    TeamDefinition,
    TeamRuntimeErrorResponse,
    TeamSendMessageRequest,
    TeamThread,
} from '../../../shared/team-types.js'
import type { SafetyGuard } from './safety-guard.js'
import { teamRuntimeError } from './team-runtime-results.js'

export function prepareTeamMessageSend(params: {
    threadId: string
    body: TeamSendMessageRequest
    thread: TeamThread
    guard: SafetyGuard
    teamDefinition?: TeamDefinition
}): { ok: true; event: MailboxEvent } | { ok: false; error: TeamRuntimeErrorResponse } {
    const {
        threadId,
        body,
        thread,
        guard,
        teamDefinition,
    } = params

    const timeoutCheck = guard.checkTimeout(thread)
    if (!timeoutCheck.ok) {
        return { ok: false, error: teamRuntimeError(timeoutCheck.reason, 429) }
    }

    const event: MailboxEvent = {
        id: nanoid(),
        type: 'message.sent',
        sourceType: 'agent',
        source: body.from,
        timestamp: Date.now(),
        payload: { from: body.from, to: body.to, tag: body.tag, threadId },
    }

    const budgetCheck = guard.checkEventBudget(event)
    if (!budgetCheck.ok) {
        return { ok: false, error: teamRuntimeError(budgetCheck.reason, 429) }
    }

    if (teamDefinition) {
        const permissionCheck = guard.checkPermission(body.from, body.to, teamDefinition.relations)
        if (!permissionCheck.ok) {
            return { ok: false, error: teamRuntimeError(permissionCheck.reason, 403) }
        }
    }

    const pairCheck = guard.checkPairBudget(body.from, body.to)
    if (!pairCheck.ok) {
        return { ok: false, error: teamRuntimeError(pairCheck.reason, 429) }
    }

    const loopCheck = guard.checkLoopDetection(body.from, body.to)
    if (!loopCheck.ok) {
        return { ok: false, error: teamRuntimeError(loopCheck.reason, 429) }
    }

    return { ok: true, event }
}
