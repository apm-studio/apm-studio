import type {
    TeamRuntimeErrorResponse,
    TeamSendMessageRequest,
    TeamSendMessageResponse,
} from '../../../shared/team-types.js'
import type { SafetyGuard } from './safety-guard.js'
import type { ThreadManager } from './thread-manager.js'
import type { WakeCascadeDispatcher } from './wake-cascade-dispatcher.js'
import { prepareTeamMessageSend } from './message-command-rules.js'
import { teamRuntimeError } from './team-runtime-results.js'

export async function sendTeamRuntimeMessage(params: {
    threadId: string
    body: TeamSendMessageRequest
    threadManager: ThreadManager
    wakeCascadeDispatcher: WakeCascadeDispatcher
    getSafetyGuard: (threadId: string) => SafetyGuard
}): Promise<TeamSendMessageResponse | TeamRuntimeErrorResponse> {
    const {
        threadId,
        body,
        threadManager,
        wakeCascadeDispatcher,
        getSafetyGuard,
    } = params
    const runtime = threadManager.getThreadRuntime(threadId)
    if (!runtime) {
        return teamRuntimeError(`Thread ${threadId} not found`, 404)
    }

    const guard = getSafetyGuard(threadId)
    const teamDefinition = threadManager.getTeamDefinition(threadId)
    const preparedSend = prepareTeamMessageSend({
        threadId,
        body,
        thread: runtime.thread,
        guard,
        teamDefinition,
    })
    if (!preparedSend.ok) {
        return preparedSend.error
    }
    const event = preparedSend.event

    const message = runtime.mailbox.addMessage({
        from: body.from,
        to: body.to,
        content: body.content,
        tag: body.tag,
        threadId,
    })

    event.payload = { messageId: message.id, from: body.from, to: body.to, tag: body.tag, threadId }
    await threadManager.logEvent(threadId, event)

    if (teamDefinition) {
        wakeCascadeDispatcher.dispatch({
            threadId,
            event,
            teamDefinition,
            mailbox: runtime.mailbox,
            source: 'sendMessage',
        })
    }

    return { ok: true as const, messageId: message.id }
}
