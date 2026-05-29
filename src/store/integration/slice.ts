import type { StateCreator } from 'zustand'
import type { IntegrationSlice } from './types'
import type { StudioState } from '../types'
import { chatApi } from '../../api-clients/chat'
import { logChatDebug } from '../../lib/chat-debug'
import {
    handleMcpBrowserOpenFailed,
    handleMcpToolsChanged,
} from './event-handlers'
import {
    reconnectManagedEventSource,
    closeManagedEventSource,
    resetManagedEventSource,
} from './eventsource'
import type { EventSourceSlot } from './eventsource'
import { createEventIngest } from '../session/event-ingest'
import { syncSessionSnapshot } from '../session'
import {
    clearSessionRuntimeActors,
    ensureSessionRuntimeActor,
    patchSessionRuntimeActor,
} from '../session/session-runtime-manager'
import { hasRunningStudioSessions } from '../runtime/reload-utils'
import {
    createSessionSupervisor,
    shouldStartSessionSupervision,
    shouldStopSessionSupervision,
} from '../chat/session-recovery'
import { createCompilePromptAction } from './compile-prompt-action'
import { createSessionRuntimeRehydrator } from './session-runtime-rehydrator'
import { createSessionSyncController } from './session-sync-controller'
import { createTeamThreadRealtimeActions } from './team-thread-realtime-actions'
import {
    buildRuntimePatchFromEvent,
    CHAT_EVENT_TYPES,
    readSessionIdFromEventProperties,
    streamTargetToChatKey,
    type ChatEvent,
    type RuntimeProjectionConsumedProperties,
    type SessionStreamTarget,
    type TeamThreadRuntimeSnapshot,
} from './realtime-event-helpers'

export const createIntegrationSlice: StateCreator<
    StudioState,
    [],
    [],
    IntegrationSlice
> = (set, get) => {
    let eventSourceInstance: EventSource | null = null
    let eventSourceWorkingDir: string | null = null

    const chatSlot: EventSourceSlot = {
        getInstance: () => eventSourceInstance,
        setInstance: (next) => {
            eventSourceInstance = next
        },
        getWorkingDir: () => eventSourceWorkingDir,
        setWorkingDir: (next) => {
            eventSourceWorkingDir = next
        },
    }

    const sessionSync = createSessionSyncController({
        set,
        get,
        resolveSession: chatApi.resolveSession,
    })
    const rehydrateSessionRuntimeState = createSessionRuntimeRehydrator({
        set,
        get,
        sessionSync,
        listPendingPermissions: chatApi.listPendingPermissions,
        listPendingQuestions: chatApi.listPendingQuestions,
        status: chatApi.status,
        todos: chatApi.todos,
    })
    const teamThreadEvents = createTeamThreadRealtimeActions({ set, get })

    const sessionSupervisor = createSessionSupervisor({
        get,
        syncSessionMessages: (chatKey, sessionId) => syncSessionSnapshot(set, get, chatKey, sessionId),
        setSessionStatus: (sessionId, status) => get().setSessionStatus(sessionId, status),
        setSessionLoading: (sessionId, loading) => get().setSessionLoading(sessionId, loading),
    })

    function reconcileSessionSupervision(
        target: SessionStreamTarget | null,
        sessionId: string,
        events: ChatEvent[],
    ) {
        if (!target) {
            return
        }

        let nextAction: 'start' | 'stop' | null = null
        for (const event of events) {
            if (shouldStopSessionSupervision(event)) {
                nextAction = 'stop'
                continue
            }
            if (shouldStartSessionSupervision(event)) {
                nextAction = 'start'
            }
        }

        if (nextAction === 'stop') {
            sessionSupervisor.stop(sessionId)
            return
        }

        if (nextAction === 'start') {
            sessionSupervisor.schedule(streamTargetToChatKey(target), sessionId)
        }
    }

    function processResolvedSessionEvents(
        target: SessionStreamTarget | null,
        sessionId: string,
        events: ChatEvent[],
    ) {
        if (!target) {
            return
        }

        reconcileSessionSupervision(target, sessionId, events)
        for (const event of events) {
            patchSessionRuntimeActor(set, get, {
                chatKey: streamTargetToChatKey(target),
                sessionId,
                patch: buildRuntimePatchFromEvent(event),
            })
            if (!event.type || !CHAT_EVENT_TYPES.has(event.type)) {
                continue
            }
            eventIngest.enqueue(event)
        }
    }

    function reconnectEventSource() {
        reconnectManagedEventSource({
            slot: chatSlot,
            resolveWorkingDir: () => get().workingDir || null,
            createEventSource: () => chatApi.events(),
            onDisconnect: () => {
                eventIngest.flushSync()
            },
            onMessage: (data: unknown) => {
                const event = data as ChatEvent

                if (event.type === 'server.instance.disposed') {
                    resetManagedEventSource(chatSlot)
                    reconnectEventSource()
                    return
                }

                if (event.type === 'server.connected') {
                    void rehydrateSessionRuntimeState()
                    sessionSync.reconcileKnownSessions({ syncReason: 'server.connected' })
                    return
                }

                if (event.type === 'server.heartbeat') {
                    return
                }

                if (event.type === 'team.thread.updated') {
                    const thread = (event.properties as { thread?: TeamThreadRuntimeSnapshot } | undefined)?.thread
                    if (thread) {
                        void teamThreadEvents.handleUpdated(thread)
                    }
                    return
                }

                if (event.type === 'runtime.projection.consumed') {
                    const patch = (event.properties as RuntimeProjectionConsumedProperties | undefined)?.patch
                    if (patch) {
                        get().clearProjectionDirty({
                            agentIds: patch.agentIds || [],
                            teamIds: patch.teamIds || [],
                            draftIds: patch.draftIds || [],
                            workspaceWide: patch.workspaceWide === true,
                        })
                    }
                    return
                }

                if (event.type === 'team.thread.deleted') {
                    const properties = event.properties as { teamId?: string; threadId?: string } | undefined
                    if (properties?.teamId && properties.threadId) {
                        teamThreadEvents.handleDeleted(properties.teamId, properties.threadId)
                    }
                    return
                }

                const rawProps = event.properties as {
                    sessionID?: string
                    ownerId?: string
                    info?: { sessionID?: string }
                    part?: { sessionID?: string }
                } | undefined
                const sessionId = readSessionIdFromEventProperties(rawProps)
                if (event.type && CHAT_EVENT_TYPES.has(event.type) && event.type !== 'message.part.delta') {
                    logChatDebug('integration', 'received chat event', {
                        type: event.type,
                        sessionId: sessionId || null,
                        ownerId: rawProps?.ownerId || null,
                    })
                }
                if (sessionId) {
                    if (rawProps?.ownerId && !get().sessionToChatKey[sessionId]) {
                        logChatDebug('integration', 'bind session from event owner', {
                            sessionId,
                            ownerId: rawProps.ownerId,
                        })
                        sessionSync.registerResolvedSessionBinding(sessionId, rawProps.ownerId)
                    }
                    const knownTarget = sessionSync.getSessionTarget(sessionId)
                    if (!knownTarget) {
                        logChatDebug('integration', 'event session target unknown', {
                            type: event.type,
                            sessionId,
                        })
                        if (event.type && CHAT_EVENT_TYPES.has(event.type)) {
                            sessionSync.bufferPendingSessionEvent(sessionId, event)
                        }
                        sessionSync.tryLazyResolveSession(sessionId, processResolvedSessionEvents)
                        return
                    }
                    ensureSessionRuntimeActor(set, get, streamTargetToChatKey(knownTarget), sessionId)
                    processResolvedSessionEvents(knownTarget, sessionId, [
                        ...sessionSync.takePendingSessionEvents(sessionId),
                        event,
                    ])
                    return
                }

                if (event.type && CHAT_EVENT_TYPES.has(event.type)) {
                    eventIngest.enqueue(event)
                    return
                }

                if (event.type === 'mcp.tools.changed') return handleMcpToolsChanged(get)
                if (event.type === 'mcp.browser.open.failed') return handleMcpBrowserOpenFailed(event)
            },
        })
    }

    const eventIngest = createEventIngest({
        get,
        set,
        onHeartbeatTimeout: () => {
            resetManagedEventSource(chatSlot)
            reconnectEventSource()
        },
        onSessionIdle: (sessionId: string) => {
            sessionSupervisor.stop(sessionId)
            logChatDebug('integration', 'session idle callback', { sessionId })
            void sessionSync.ensureSessionTarget(sessionId).then((target) => {
                if (target) {
                    patchSessionRuntimeActor(set, get, {
                        chatKey: streamTargetToChatKey(target),
                        sessionId,
                        patch: {
                            authoritativeStatus: { type: 'idle' },
                            optimistic: false,
                            syncing: false,
                            supervising: false,
                        },
                    })
                    return sessionSync.syncSessionMessages(target, sessionId, {
                        force: true,
                        reason: 'session.idle',
                    })
                }
                logChatDebug('integration', 'session idle callback target missing', { sessionId })
                return undefined
            })
            const state = get()
            if (state.runtimeReloadPending && !hasRunningStudioSessions(state)) {
                void state.applyPendingRuntimeReload()
            }
        },
        onSessionCompacted: (sessionId: string) => {
            logChatDebug('integration', 'session compacted callback', { sessionId })
            void sessionSync.ensureSessionTarget(sessionId).then((target) => {
                if (target) {
                    patchSessionRuntimeActor(set, get, {
                        chatKey: streamTargetToChatKey(target),
                        sessionId,
                        patch: { syncing: true },
                    })
                    return sessionSync.syncSessionMessages(target, sessionId, {
                        force: true,
                        reason: 'session.compacted',
                    })
                }
                logChatDebug('integration', 'session compacted callback target missing', { sessionId })
                return undefined
            })
        },
    })

    return ({
        initRealtimeEvents: () => {
            reconnectEventSource()
            void rehydrateSessionRuntimeState()
        },

        forceReconnectRealtimeEvents: () => {
            resetManagedEventSource(chatSlot)
            reconnectEventSource()
        },

        cleanupRealtimeEvents: () => {
            closeManagedEventSource(chatSlot)
            chatSlot.setWorkingDir(null)
            eventIngest.dispose()
            sessionSupervisor.dispose()
            clearSessionRuntimeActors(set, get)
            sessionSync.clear()
        },

        watchSessionLifecycle: (chatKey, sessionId) => {
            ensureSessionRuntimeActor(set, get, chatKey, sessionId)
            patchSessionRuntimeActor(set, get, {
                chatKey,
                sessionId,
                patch: {
                    supervising: true,
                    optimistic: false,
                },
            })
            sessionSupervisor.schedule(chatKey, sessionId)
        },

        stopWatchingSessionLifecycle: (sessionId) => {
            patchSessionRuntimeActor(set, get, {
                sessionId,
                patch: {
                    supervising: false,
                    syncing: false,
                    optimistic: false,
                },
            })
            sessionSupervisor.stop(sessionId)
        },

        compilePrompt: createCompilePromptAction(get),
    })
}
