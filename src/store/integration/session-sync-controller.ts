import type { ChatSessionResolveResponse } from '../../../shared/chat-contracts'
import { logChatDebug } from '../../lib/chat-debug'
import type { StudioState } from '../types'
import {
    registerSessionBinding,
    syncSessionSnapshot,
} from '../session'
import {
    ensureSessionRuntimeActor,
    patchSessionRuntimeActor,
    reconcileSessionRuntimeActor,
} from '../session/session-runtime-manager'
import {
    resolveSessionTarget,
    streamTargetToChatKey,
    type ChatEvent,
    type SessionScopedRequest,
    type SessionStreamTarget,
} from './realtime-event-helpers'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState
type ResolveSession = (sessionId: string) => Promise<ChatSessionResolveResponse>
type LazyResolvedHandler = (
    target: SessionStreamTarget,
    sessionId: string,
    queuedEvents: ChatEvent[],
) => void

const FAILED_RESOLVE_RETRY_MS = 2_000
const SESSION_SYNC_DEBOUNCE_MS = 1_000
const MAX_PENDING_EVENTS_PER_SESSION = 200

export function createSessionSyncController(input: {
    set: SetState
    get: GetState
    resolveSession: ResolveSession
}) {
    const { set, get, resolveSession } = input
    const syncingSessions = new Set<string>()
    const pendingResolves = new Set<string>()
    const failedResolves = new Map<string, number>()
    const lastSyncedAt = new Map<string, number>()
    const pendingSessionEvents = new Map<string, ChatEvent[]>()

    function registerResolvedSessionBinding(sessionId: string, ownerId: string) {
        const existingSessionId = get().chatKeyToSession[ownerId]
        if (existingSessionId && existingSessionId !== sessionId) {
            logChatDebug('integration', 'skip owner bind: owner already points at another session', {
                sessionId,
                ownerId,
                existingSessionId,
            })
            return false
        }

        registerSessionBinding(set, get, ownerId, sessionId)
        ensureSessionRuntimeActor(set, get, ownerId, sessionId)
        reconcileSessionRuntimeActor(set, get, ownerId, sessionId)
        return true
    }

    function bufferPendingSessionEvent(sessionId: string, event: ChatEvent) {
        const queue = pendingSessionEvents.get(sessionId) || []
        queue.push(event)
        if (queue.length > MAX_PENDING_EVENTS_PER_SESSION) {
            queue.splice(0, queue.length - MAX_PENDING_EVENTS_PER_SESSION)
        }
        pendingSessionEvents.set(sessionId, queue)
    }

    function takePendingSessionEvents(sessionId: string) {
        const queue = pendingSessionEvents.get(sessionId)
        if (!queue?.length) {
            return []
        }
        pendingSessionEvents.delete(sessionId)
        logChatDebug('integration', 'flush buffered session events', {
            sessionId,
            count: queue.length,
        })
        return queue
    }

    function repairKnownSessionBinding(sessionId: string): SessionStreamTarget | null {
        const directTarget = resolveSessionTarget(get(), sessionId)
        if (directTarget) {
            return directTarget
        }

        const repairedEntry = Object.entries(get().chatKeyToSession)
            .find(([, boundSessionId]) => boundSessionId === sessionId)
        if (!repairedEntry) {
            return null
        }

        registerSessionBinding(set, get, repairedEntry[0], sessionId)
        ensureSessionRuntimeActor(set, get, repairedEntry[0], sessionId)
        reconcileSessionRuntimeActor(set, get, repairedEntry[0], sessionId)
        return resolveSessionTarget(get(), sessionId)
    }

    function getSessionTarget(sessionId: string): SessionStreamTarget | null {
        return repairKnownSessionBinding(sessionId) || resolveSessionTarget(get(), sessionId)
    }

    async function resolveSessionBindingFromServer(sessionId: string) {
        try {
            const result = await resolveSession(sessionId)
            if (!result.found || !result.ownerId) {
                failedResolves.set(sessionId, Date.now())
                return null
            }

            failedResolves.delete(sessionId)
            if (!registerResolvedSessionBinding(sessionId, result.ownerId)) {
                return null
            }
            return {
                ownerId: result.ownerId,
                ownerKind: result.ownerKind,
            }
        } catch {
            failedResolves.set(sessionId, Date.now())
            return null
        }
    }

    async function ensureSessionTarget(sessionId: string): Promise<SessionStreamTarget | null> {
        const repaired = repairKnownSessionBinding(sessionId)
        if (repaired) {
            return repaired
        }

        const resolved = await resolveSessionBindingFromServer(sessionId)
        if (!resolved) {
            return null
        }

        return resolveSessionTarget(get(), sessionId)
    }

    async function syncSessionMessages(
        target: SessionStreamTarget,
        sessionId: string,
        options?: { force?: boolean; reason?: string },
    ) {
        const chatKey = streamTargetToChatKey(target)
        if (syncingSessions.has(sessionId)) {
            logChatDebug('integration', 'skip sync: already syncing', {
                sessionId,
                chatKey,
                reason: options?.reason || 'background',
            })
            return
        }

        const lastSynced = lastSyncedAt.get(sessionId) || 0
        if (!options?.force && (Date.now() - lastSynced) < SESSION_SYNC_DEBOUNCE_MS) {
            logChatDebug('integration', 'skip sync: recently synced', {
                sessionId,
                chatKey,
                reason: options?.reason || 'background',
            })
            return
        }

        syncingSessions.add(sessionId)
        patchSessionRuntimeActor(set, get, {
            chatKey,
            sessionId,
            patch: {
                syncing: true,
                optimistic: false,
                lastSyncReason: options?.reason || 'background',
            },
        })
        try {
            logChatDebug('integration', 'sync session messages', {
                sessionId,
                chatKey,
                reason: options?.reason || 'background',
                target: target.kind,
            })
            await syncSessionSnapshot(set, get, chatKey, sessionId)
            reconcileSessionRuntimeActor(set, get, chatKey, sessionId)
            lastSyncedAt.set(sessionId, Date.now())
        } catch {
            // Background refresh failures should not discard streamed content.
        } finally {
            patchSessionRuntimeActor(set, get, {
                chatKey,
                sessionId,
                patch: {
                    syncing: false,
                },
            })
            reconcileSessionRuntimeActor(set, get, chatKey, sessionId)
            syncingSessions.delete(sessionId)
        }
    }

    function tryLazyResolveSession(sessionId: string, onResolved: LazyResolvedHandler) {
        const failedAt = failedResolves.get(sessionId)
        if (failedAt && (Date.now() - failedAt) < FAILED_RESOLVE_RETRY_MS) {
            return
        }
        if (pendingResolves.has(sessionId)) {
            return
        }
        if (resolveSessionTarget(get(), sessionId)) {
            return
        }

        pendingResolves.add(sessionId)
        logChatDebug('integration', 'lazy resolve session start', { sessionId })

        resolveSessionBindingFromServer(sessionId)
            .then((result) => {
                pendingResolves.delete(sessionId)
                if (!result?.ownerId) {
                    logChatDebug('integration', 'lazy resolve session miss', { sessionId })
                    return
                }

                logChatDebug('integration', 'lazy resolve session hit', {
                    sessionId,
                    ownerId: result.ownerId,
                    ownerKind: result.ownerKind,
                })
                const queuedEvents = takePendingSessionEvents(sessionId)
                const target = repairKnownSessionBinding(sessionId) || resolveSessionTarget(get(), sessionId)
                if (target) {
                    onResolved(target, sessionId, queuedEvents)
                    void syncSessionMessages(target, sessionId, { reason: 'lazy-resolve' })
                }
            })
            .catch(() => {
                pendingResolves.delete(sessionId)
                failedResolves.set(sessionId, Date.now())
            })
    }

    async function keepRequestsForKnownOrResolvableSessions<T extends SessionScopedRequest>(requests: T[]) {
        const accepted: T[] = []
        for (const request of requests) {
            const { sessionId } = request

            const existingTarget = getSessionTarget(sessionId)
            if (existingTarget) {
                accepted.push(request)
                continue
            }

            await resolveSessionBindingFromServer(sessionId)
            const resolvedTarget = getSessionTarget(sessionId)
            if (resolvedTarget) {
                accepted.push(request)
            }
        }
        return accepted
    }

    function reconcileSessionRuntime(sessionId: string) {
        const target = getSessionTarget(sessionId)
        if (!target) {
            return null
        }

        const chatKey = streamTargetToChatKey(target)
        ensureSessionRuntimeActor(set, get, chatKey, sessionId)
        reconcileSessionRuntimeActor(set, get, chatKey, sessionId)
        return target
    }

    function reconcileRehydratedSessions(sessionIds: Iterable<string>) {
        for (const sessionId of sessionIds) {
            reconcileSessionRuntime(sessionId)
        }
    }

    function reconcileKnownSessions(options?: { syncReason?: string }) {
        for (const sessionId of Object.keys(get().sessionToChatKey)) {
            const target = reconcileSessionRuntime(sessionId)
            if (target && options?.syncReason) {
                void syncSessionMessages(target, sessionId, { reason: options.syncReason })
            }
        }
    }

    function clear() {
        syncingSessions.clear()
        pendingResolves.clear()
        failedResolves.clear()
        lastSyncedAt.clear()
        pendingSessionEvents.clear()
    }

    return {
        registerResolvedSessionBinding,
        bufferPendingSessionEvent,
        takePendingSessionEvents,
        getSessionTarget,
        ensureSessionTarget,
        syncSessionMessages,
        tryLazyResolveSession,
        keepRequestsForKnownOrResolvableSessions,
        reconcileRehydratedSessions,
        reconcileKnownSessions,
        clear,
    }
}
