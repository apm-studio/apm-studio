import { countRunningSessions } from '../runtime/reload-service.js'
import {
    clearBlockedWakeRetryActive,
    getParticipantSessionQueue,
    markBlockedWakeRetryActive,
} from './wake-participant-state.js'

const BLOCKED_WAKE_RETRY_POLL_MS = 500

export function scheduleBlockedWakeRetry(params: {
    participantKey: string
    threadId: string
    workingDir: string
    drainWhenIdle: () => Promise<void>
}) {
    const {
        participantKey,
        threadId,
        workingDir,
        drainWhenIdle,
    } = params

    if (!markBlockedWakeRetryActive(threadId, participantKey)) {
        return
    }

    void (async () => {
        try {
            while (getParticipantSessionQueue(threadId).getQueueDepth(participantKey) > 0) {
                if (getParticipantSessionQueue(threadId).isRunning(participantKey)) {
                    return
                }

                try {
                    const { runningSessions } = await countRunningSessions(workingDir)
                    if (runningSessions === 0) {
                        await drainWhenIdle()
                        return
                    }
                } catch (error) {
                    console.warn(
                        `[wake-cascade] Failed checking running sessions for deferred wake "${participantKey}":`,
                        error,
                    )
                }

                await sleep(BLOCKED_WAKE_RETRY_POLL_MS)
            }
        } finally {
            clearBlockedWakeRetryActive(threadId, participantKey)
        }
    })()
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}
