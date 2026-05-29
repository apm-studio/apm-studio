import type { ProjectionDirtyPatch } from '../../../shared/projection-dirty'
import type { StudioState } from '../types'
import {
    selectStreamTarget,
    type SessionStreamTarget,
} from '../session/session-selectors'
import type { SessionRuntimePatch } from '../session/session-runtime'

export type { SessionStreamTarget } from '../session/session-selectors'

export type ChatEvent = {
    type?: string
    properties?: Record<string, unknown>
}

export type SessionStatusSnapshot = {
    type: 'idle' | 'busy' | 'retry' | 'error'
    attempt?: number
    message?: string
}

export type SessionScopedRequest = {
    sessionId: string
}

export type TeamThreadRuntimeSnapshot = {
    id: string
    teamId: string
    name?: string
    status: 'active' | 'idle' | 'completed' | 'interrupted'
    participantSessions: Record<string, string>
    participantStatuses: Record<string, { type: 'idle' | 'busy' | 'retry' | 'error'; updatedAt: number; message?: string }>
    createdAt: number
}

export type RuntimeProjectionConsumedProperties = {
    patch?: ProjectionDirtyPatch
}

export const CHAT_EVENT_TYPES = new Set([
    'message.updated', 'message.removed',
    'message.part.updated', 'message.part.delta', 'message.part.removed',
    'session.status', 'session.idle', 'session.compacted', 'session.error',
    'permission.asked', 'permission.replied',
    'question.asked', 'question.replied', 'question.rejected',
    'todo.updated',
])

export function readSessionIdFromEventProperties(properties: Record<string, unknown> | undefined): string | undefined {
    if (!properties) return undefined

    const directSessionId = properties.sessionID
    if (typeof directSessionId === 'string' && directSessionId) {
        return directSessionId
    }

    const info = properties.info
    if (info && typeof info === 'object') {
        const nestedSessionId = (info as { sessionID?: string }).sessionID
        if (typeof nestedSessionId === 'string' && nestedSessionId) {
            return nestedSessionId
        }
    }

    const part = properties.part
    if (part && typeof part === 'object') {
        const nestedSessionId = (part as { sessionID?: string }).sessionID
        if (typeof nestedSessionId === 'string' && nestedSessionId) {
            return nestedSessionId
        }
    }

    return undefined
}

export function resolveSessionTarget(state: StudioState, sessionId: string): SessionStreamTarget | null {
    return selectStreamTarget(state, sessionId)
}

export function streamTargetToChatKey(target: SessionStreamTarget): string {
    return target.kind === 'agent' ? target.agentId : target.chatKey
}

export function buildRuntimePatchFromEvent(event: ChatEvent): SessionRuntimePatch {
    if (event.type === 'session.status') {
        const status = event.properties?.status as {
            type?: 'idle' | 'busy' | 'retry' | 'error'
            attempt?: number
            message?: string
        } | undefined
        return {
            ...(status?.type ? {
                authoritativeStatus: {
                    type: status.type,
                    ...(typeof status.attempt === 'number' ? { attempt: status.attempt } : {}),
                    ...(typeof status.message === 'string' ? { message: status.message } : {}),
                },
            } : {}),
            optimistic: false,
            errorMessage: status?.type === 'error' ? status.message || null : null,
        }
    }
    if (event.type === 'session.idle') {
        return {
            authoritativeStatus: { type: 'idle' },
            optimistic: false,
            syncing: false,
            supervising: false,
            errorMessage: null,
        }
    }
    if (event.type === 'session.error') {
        return {
            authoritativeStatus: { type: 'error', message: String(event.properties?.error || '') },
            optimistic: false,
            syncing: false,
            errorMessage: String(event.properties?.error || ''),
        }
    }
    if (event.type === 'permission.asked') {
        return { hasPermission: true, optimistic: false }
    }
    if (event.type === 'permission.replied') {
        return { hasPermission: false }
    }
    if (event.type === 'question.asked') {
        return { hasQuestion: true, optimistic: false }
    }
    if (event.type === 'question.replied' || event.type === 'question.rejected') {
        return { hasQuestion: false }
    }
    if (event.type?.startsWith('message.')) {
        return { parked: false }
    }
    return {}
}
