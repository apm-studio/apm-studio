import type { Event as OpenCodeEvent, GlobalEvent } from '@opencode-ai/sdk/v2'
import { getOpencode } from '../../lib/opencode.js'
import { sseEncode } from '../../lib/sse.js'
import { resolveSessionOwnership } from './session-ownership-service.js'
import { subscribeTeamRuntimeEvents } from '../team-runtime/team-runtime-events.js'
import { subscribeRuntimeExecutionEvents } from '../runtime/execution-events.js'

const HEARTBEAT_INTERVAL_MS = 30_000
const EXECUTION_DIRECTORY_REFRESH_MS = 1_000

type StreamEvent = OpenCodeEvent
type GlobalStreamEvent = Omit<Partial<GlobalEvent>, 'payload'> & {
    payload?: StreamEvent
}
type SessionOwnershipContext = NonNullable<Awaited<ReturnType<typeof resolveSessionOwnership>>>

async function listEventDirectories(workingDir: string) {
    return [workingDir]
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function readSessionIdFromRecord(record: Record<string, unknown> | null | undefined): string | null {
    if (!record) {
        return null
    }

    const direct = record.sessionID
    if (typeof direct === 'string' && direct) {
        return direct
    }

    const info = readRecord(record.info)
    const infoSessionId = info?.sessionID
    if (typeof infoSessionId === 'string' && infoSessionId) {
        return infoSessionId
    }

    const part = readRecord(record.part)
    const partSessionId = part?.sessionID
    if (typeof partSessionId === 'string' && partSessionId) {
        return partSessionId
    }

    return null
}

function normalizeGlobalStreamEvent(event: GlobalStreamEvent): { directory?: string; event: StreamEvent } | null {
    if (!event.payload?.type) {
        return null
    }
    return {
        directory: typeof event.directory === 'string' ? event.directory : undefined,
        event: event.payload,
    }
}

function readSessionIdFromEvent(event: StreamEvent): string | null {
    return readSessionIdFromRecord(readRecord(event.properties))
}

function isSessionRuntimeEvent(event: StreamEvent) {
    return event.type?.startsWith('message.')
        || event.type?.startsWith('session.')
        || event.type === 'permission.asked'
        || event.type === 'permission.replied'
        || event.type === 'question.asked'
        || event.type === 'question.replied'
        || event.type === 'question.rejected'
        || event.type === 'todo.updated'
}

export async function buildStudioChatEventStream(workingDir: string, abortSignal?: AbortSignal) {
    const oc = await getOpencode()
    let closeStream: (() => void) | null = null

    return new ReadableStream({
        async start(controller) {
            let active = true
            let subscribed = false
            let connecting = false
            let subscriptionController: AbortController | null = null
            const eventDirectories = new Set<string>(await listEventDirectories(workingDir))
            const ownershipCache = new Map<string, SessionOwnershipContext>()
            let heartbeatTimer: ReturnType<typeof setInterval> | null = null
            let refreshTimer: ReturnType<typeof setInterval> | null = null
            const unsubscribeTeamRuntime = subscribeTeamRuntimeEvents(workingDir, (event) => {
                enqueueEvent(event)
            })
            const unsubscribeRuntimeExecution = subscribeRuntimeExecutionEvents(workingDir, (event) => {
                enqueueEvent(event)
            })

            const close = () => {
                if (!active) {
                    return
                }
                active = false
                closeStream = null
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer)
                    heartbeatTimer = null
                }
                if (refreshTimer) {
                    clearInterval(refreshTimer)
                    refreshTimer = null
                }
                unsubscribeTeamRuntime()
                unsubscribeRuntimeExecution()
                if (subscriptionController) {
                    subscriptionController.abort()
                    subscriptionController = null
                }
                subscribed = false
                connecting = false
                eventDirectories.clear()
                ownershipCache.clear()
                abortSignal?.removeEventListener('abort', close)
                try {
                    controller.close()
                } catch {
                    // Stream may already be closed.
                }
            }

            const enqueueEvent = (event: unknown) => {
                if (!active) {
                    return
                }
                try {
                    controller.enqueue(sseEncode(JSON.stringify(event)))
                } catch {
                    close()
                }
            }

            const finishSubscription = (controllerForSubscription: AbortController) => {
                if (subscriptionController === controllerForSubscription) {
                    subscriptionController = null
                }
                controllerForSubscription.abort()
                subscribed = false
                connecting = false
            }

            const resolveOwnershipCached = async (sessionId: string) => {
                const cached = ownershipCache.get(sessionId)
                if (cached) {
                    return cached
                }
                const context = await resolveSessionOwnership(sessionId)
                if (context) {
                    ownershipCache.set(sessionId, context)
                }
                return context
            }

            const subscribeOpencodeEvents = async () => {
                if (!active || subscribed || connecting) {
                    return
                }

                connecting = true
                const nextSubscriptionController = new AbortController()
                subscriptionController = nextSubscriptionController
                try {
                    const subscription = await oc.global.event({
                        signal: nextSubscriptionController.signal,
                        sseMaxRetryAttempts: 1,
                    })

                    if (!active) {
                        finishSubscription(nextSubscriptionController)
                        return
                    }

                    connecting = false
                    subscribed = true

                    void (async () => {
                        try {
                            for await (const rawEvent of subscription.stream as AsyncIterable<GlobalStreamEvent>) {
                                if (!active) {
                                    return
                                }
                                const normalized = normalizeGlobalStreamEvent(rawEvent)
                                if (!normalized) {
                                    continue
                                }
                                if (normalized.directory && !eventDirectories.has(normalized.directory)) {
                                    continue
                                }
                                const { event } = normalized

                                if (event.type === 'permission.asked') {
                                    const properties = readRecord(event.properties)
                                    const sessionID = readSessionIdFromRecord(properties)
                                    const permissionID = typeof properties?.id === 'string'
                                        ? properties.id
                                        : null
                                    if (sessionID && permissionID) {
                                        const context = await resolveOwnershipCached(sessionID)
                                        if (context?.ownerKind === 'team') {
                                            try {
                                                await oc.permission.reply({
                                                    requestID: permissionID,
                                                    reply: 'always',
                                                    directory: context.workingDir,
                                                })
                                            } catch (error) {
                                                console.error('Failed to auto-accept permission for Team session:', error)
                                            }
                                            continue
                                        }
                                    }
                                }

                                if (isSessionRuntimeEvent(event)) {
                                    const sessionID = readSessionIdFromEvent(event)
                                    if (sessionID) {
                                        const context = await resolveOwnershipCached(sessionID)
                                        if (context) {
                                            enqueueEvent({
                                                ...event,
                                                properties: {
                                                    ...(event.properties || {}),
                                                    ownerId: context.ownerId,
                                                    ownerKind: context.ownerKind,
                                                },
                                            })
                                            continue
                                        }
                                    }
                                }

                                enqueueEvent(event)
                            }
                        } catch {
                            // Ignore broken subscription and keep stream alive.
                        } finally {
                            finishSubscription(nextSubscriptionController)
                            // The refresh timer owns reconnect cadence so failed streams
                            // cannot spin in a tight recursive loop.
                        }
                    })()
                } catch {
                    finishSubscription(nextSubscriptionController)
                }
            }

            const refreshSubscription = async () => {
                if (!active) {
                    return
                }
                const directories = await listEventDirectories(workingDir)
                eventDirectories.clear()
                for (const directory of directories) {
                    eventDirectories.add(directory)
                }
                await subscribeOpencodeEvents()
            }

            if (abortSignal?.aborted) {
                close()
                return
            }
            abortSignal?.addEventListener('abort', close, { once: true })
            closeStream = close

            heartbeatTimer = setInterval(() => {
                enqueueEvent({ type: 'server.heartbeat' })
            }, HEARTBEAT_INTERVAL_MS)

            refreshTimer = setInterval(() => {
                void refreshSubscription()
            }, EXECUTION_DIRECTORY_REFRESH_MS)

            await refreshSubscription()
        },
        cancel() {
            closeStream?.()
        },
    })
}
