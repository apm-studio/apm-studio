import { waitForSessionToSettle } from '../../lib/chat-session.js'
import { getOpencode } from '../../lib/opencode.js'

const parkedSessions = new Set<string>()
const settleWatchers = new Map<string, Promise<void>>()

function markTeamSessionWaitUntilParked(sessionId: string) {
    parkedSessions.add(sessionId)
}

export function clearTeamSessionWaitUntilParked(sessionId: string) {
    parkedSessions.delete(sessionId)
}

export function isTeamSessionWaitUntilParked(sessionId: string) {
    return parkedSessions.has(sessionId)
}

export function parkTeamSessionUntilSettled(sessionId: string, workingDir: string) {
    markTeamSessionWaitUntilParked(sessionId)
    if (settleWatchers.has(sessionId)) {
        return
    }

    const watcher = (async () => {
        try {
            const oc = await getOpencode()
            await waitForSessionToSettle(
                oc,
                sessionId,
                { directory: workingDir },
                {
                    timeoutMs: 10 * 60_000,
                    pollMs: 150,
                    requireObservedBusy: true,
                },
            ).catch(() => {})
        } finally {
            parkedSessions.delete(sessionId)
            settleWatchers.delete(sessionId)
        }
    })()

    settleWatchers.set(sessionId, watcher)
}
