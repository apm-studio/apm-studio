import {
    readMessagePartDeltaPayload,
    readSessionId,
    type SSEEvent,
} from './event-payloads'

export function coalesceEventBuffer(events: SSEEvent[]): SSEEvent[] {
    if (events.length <= 1) return events

    const result: Array<SSEEvent | null> = []
    const lastStatusIndex = new Map<string, number>()
    const deltaAccum = new Map<string, { idx: number; delta: string }>()

    const flushDeltaAccum = () => {
        for (const [, { idx, delta }] of deltaAccum) {
            const event = result[idx]
            if (event && event.type === 'message.part.delta' && event.properties) {
                event.properties.delta = delta
            }
        }
        deltaAccum.clear()
    }

    for (const event of events) {
        const type = event.type

        if (type === 'session.status') {
            const sessionId = readSessionId(event.properties)
            if (sessionId) {
                const prevIdx = lastStatusIndex.get(sessionId)
                if (prevIdx !== undefined) {
                    result[prevIdx] = null
                }
                lastStatusIndex.set(sessionId, result.length)
            }
        }

        if (type === 'message.part.delta') {
            const deltaPayload = readMessagePartDeltaPayload(event.properties)
            const partKey = deltaPayload
                ? `${deltaPayload.sessionId}:${deltaPayload.messageId}:${deltaPayload.partId}`
                : ''
            const existing = deltaAccum.get(partKey)
            if (existing !== undefined) {
                existing.delta += deltaPayload?.delta || ''
                continue
            }

            if (deltaPayload) {
                deltaAccum.set(partKey, { idx: result.length, delta: deltaPayload.delta })
            }
        } else {
            flushDeltaAccum()
        }

        result.push(event)
    }

    flushDeltaAccum()

    return result.filter((event): event is SSEEvent => !!event)
}
