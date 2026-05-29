import { coalesceEventBuffer } from './event-coalescing'
import { dispatchSessionEvent } from './event-dispatch'
import {
    FRAME_BUDGET_MS,
    HEARTBEAT_TIMEOUT_MS,
    MAX_EVENTS_PER_FRAME,
    type EventIngestOptions,
} from './event-ingest-types'
import type { SSEEvent } from './event-payloads'

export function createEventIngest(options: EventIngestOptions) {
    const { get, set, onHeartbeatTimeout, onSessionIdle, onSessionCompacted } = options

    let buffer: SSEEvent[] = []
    let pendingFlushEvents: SSEEvent[] = []
    let rafId: number | null = null
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

    function now() {
        return typeof performance !== 'undefined' ? performance.now() : Date.now()
    }

    function resetHeartbeat() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer)
        heartbeatTimer = setTimeout(() => {
            onHeartbeatTimeout?.()
        }, HEARTBEAT_TIMEOUT_MS)
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearTimeout(heartbeatTimer)
            heartbeatTimer = null
        }
    }

    function enqueueBufferedEvents() {
        if (buffer.length === 0) {
            return
        }

        pendingFlushEvents.push(...coalesceEventBuffer(buffer))
        buffer = []
    }

    function processEvent(event: SSEEvent) {
        dispatchSessionEvent(event, {
            get,
            set,
            onSessionIdle,
            onSessionCompacted,
        })
    }

    function flush() {
        rafId = null
        enqueueBufferedEvents()
        if (pendingFlushEvents.length === 0) return

        const startedAt = now()
        let processedCount = 0
        while (
            pendingFlushEvents.length > 0
            && processedCount < MAX_EVENTS_PER_FRAME
            && (now() - startedAt) < FRAME_BUDGET_MS
        ) {
            const event = pendingFlushEvents.shift()
            if (!event) {
                break
            }
            processEvent(event)
            processedCount += 1
        }

        if (pendingFlushEvents.length > 0 || buffer.length > 0) {
            rafId = requestAnimationFrame(flush)
        }
    }

    return {
        enqueue(event: SSEEvent) {
            resetHeartbeat()
            buffer.push(event)
            if (rafId === null) {
                rafId = requestAnimationFrame(flush)
            }
        },

        flushSync() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            enqueueBufferedEvents()
            while (pendingFlushEvents.length > 0) {
                const event = pendingFlushEvents.shift()
                if (!event) {
                    break
                }
                processEvent(event)
            }
        },

        dispose() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            stopHeartbeat()
            buffer = []
            pendingFlushEvents = []
        },

        get pendingCount() {
            return buffer.length + pendingFlushEvents.length
        },
    }
}
