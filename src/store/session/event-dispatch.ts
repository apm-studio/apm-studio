import { logChatDebug } from '../../lib/chat-debug'
import {
    reduceMessagePartDelta,
    reduceMessagePartRemoved,
    reduceMessagePartUpdated,
    reduceMessageRemoved,
    reduceMessageUpdated,
    reducePermissionAsked,
    reducePermissionReplied,
    reduceQuestionAsked,
    reduceQuestionReplied,
    reduceSessionError,
    reduceSessionStatus,
    reduceTodoUpdated,
    reduceToolCallStatusByCallId,
} from './event-reducer'
import {
    readMessagePartDeltaPayload,
    readMessagePartRemovedPayload,
    readMessagePartUpdatedPayload,
    readMessageRemovedPayload,
    readMessageUpdatedPayload,
    readPermissionAskedPayload,
    readQuestionAskedPayload,
    readSessionErrorPayload,
    readSessionOnlyPayload,
    readSessionRetriedPayload,
    readSessionStatusPayload,
    readShellEndedPayload,
    readShellStartedPayload,
    readTodoUpdatedPayload,
    readToolFailedPayload,
    readToolSuccessPayload,
    type SSEEvent,
} from './event-payloads'
import type { SessionEventDispatchContext } from './event-ingest-types'

export function dispatchSessionEvent(event: SSEEvent, context: SessionEventDispatchContext) {
    const { get, set, onSessionIdle, onSessionCompacted } = context
    const type = event.type
    const props = event.properties || {}

    switch (type) {
        case 'message.updated': {
            const payload = readMessageUpdatedPayload(props)
            if (!payload) return
            reduceMessageUpdated(payload.sessionId, payload.messageId, payload.role, payload.createdAt, get, set)
            return
        }

        case 'message.removed': {
            const payload = readMessageRemovedPayload(props)
            if (!payload) return
            reduceMessageRemoved(payload.sessionId, payload.messageId, get, set)
            return
        }

        case 'message.part.updated': {
            const payload = readMessagePartUpdatedPayload(props)
            if (!payload) return
            reduceMessagePartUpdated(
                payload.sessionId,
                payload.messageId,
                payload.part,
                get,
                set,
            )
            return
        }

        case 'message.part.delta': {
            const payload = readMessagePartDeltaPayload(props)
            if (!payload) return
            reduceMessagePartDelta(payload.sessionId, payload.messageId, payload.partId, payload.field, payload.delta, get, set)
            return
        }

        case 'message.part.removed': {
            const payload = readMessagePartRemovedPayload(props)
            if (!payload) return
            reduceMessagePartRemoved(payload.sessionId, payload.messageId, payload.partId, get, set)
            return
        }

        case 'session.status': {
            const payload = readSessionStatusPayload(props)
            if (!payload) return
            logChatDebug('event-ingest', 'apply session.status', {
                sessionId: payload.sessionId,
                status: payload.status.type,
                attempt: payload.status.attempt,
                message: payload.status.message,
            })
            reduceSessionStatus(
                payload.sessionId,
                payload.status,
                get,
                set,
            )
            if (payload.status.type === 'idle') {
                onSessionIdle?.(payload.sessionId)
            }
            return
        }

        case 'session.idle': {
            const payload = readSessionOnlyPayload(props)
            if (!payload) return
            logChatDebug('event-ingest', 'apply session.idle', { sessionId: payload.sessionId })
            reduceSessionStatus(payload.sessionId, { type: 'idle' }, get, set)
            onSessionIdle?.(payload.sessionId)
            return
        }

        case 'session.compacted': {
            const payload = readSessionOnlyPayload(props)
            if (!payload) return
            logChatDebug('event-ingest', 'apply session.compacted', { sessionId: payload.sessionId })
            onSessionCompacted?.(payload.sessionId)
            return
        }

        case 'session.error': {
            const payload = readSessionErrorPayload(props)
            if (!payload) return
            logChatDebug('event-ingest', 'apply session.error', {
                sessionId: payload.sessionId,
                error: payload.message,
            })
            reduceSessionError(payload.sessionId, payload.message, get, set)
            return
        }

        case 'session.next.step.failed': {
            const payload = readSessionErrorPayload(props)
            if (!payload) return
            logChatDebug('event-ingest', 'apply session.next.step.failed', {
                sessionId: payload.sessionId,
                error: payload.message,
            })
            reduceSessionError(payload.sessionId, payload.message, get, set)
            return
        }

        case 'session.next.tool.failed': {
            const payload = readToolFailedPayload(props)
            if (!payload) return
            reduceToolCallStatusByCallId(payload.sessionId, payload.callId, payload.patch, get, set)
            return
        }

        case 'session.next.tool.success': {
            const payload = readToolSuccessPayload(props)
            if (!payload) return
            reduceToolCallStatusByCallId(payload.sessionId, payload.callId, payload.patch, get, set)
            return
        }

        case 'session.next.shell.started': {
            const payload = readShellStartedPayload(props)
            if (!payload) return
            reduceToolCallStatusByCallId(payload.sessionId, payload.callId, payload.patch, get, set)
            return
        }

        case 'session.next.shell.ended': {
            const payload = readShellEndedPayload(props)
            if (!payload) return
            reduceToolCallStatusByCallId(payload.sessionId, payload.callId, payload.patch, get, set)
            return
        }

        case 'session.next.retried': {
            const payload = readSessionRetriedPayload(props)
            if (!payload) return
            reduceSessionStatus(
                payload.sessionId,
                payload.status,
                get,
                set,
            )
            return
        }

        case 'session.next.compaction.ended': {
            const payload = readSessionOnlyPayload(props)
            if (!payload) return
            logChatDebug('event-ingest', 'apply session.next.compaction.ended', { sessionId: payload.sessionId })
            onSessionCompacted?.(payload.sessionId)
            return
        }

        case 'permission.asked': {
            const payload = readPermissionAskedPayload(props)
            if (!payload) return
            reducePermissionAsked(payload.sessionId, payload.request, get, set)
            return
        }

        case 'permission.replied': {
            const payload = readSessionOnlyPayload(props)
            if (!payload) return
            reducePermissionReplied(payload.sessionId, get, set)
            return
        }

        case 'question.asked': {
            const payload = readQuestionAskedPayload(props)
            if (!payload) return
            reduceQuestionAsked(payload.sessionId, payload.request, get, set)
            return
        }

        case 'question.replied':
        case 'question.rejected': {
            const payload = readSessionOnlyPayload(props)
            if (!payload) return
            reduceQuestionReplied(payload.sessionId, get, set)
            return
        }

        case 'todo.updated': {
            const payload = readTodoUpdatedPayload(props)
            if (!payload) return
            reduceTodoUpdated(payload.sessionId, payload.todos, get, set)
        }
    }
}
