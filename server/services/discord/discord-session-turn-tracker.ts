export class DiscordSessionTurnTracker {
    private readonly activeSessionIds = new Set<string>()

    begin(sessionId: string) {
        if (this.activeSessionIds.has(sessionId)) {
            return false
        }
        this.activeSessionIds.add(sessionId)
        return true
    }

    end(sessionId: string) {
        this.activeSessionIds.delete(sessionId)
    }

    isActive(sessionId: string) {
        return this.activeSessionIds.has(sessionId)
    }

    clear() {
        this.activeSessionIds.clear()
    }
}
