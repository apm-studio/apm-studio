export interface IntegrationSlice {
    initRealtimeEvents: () => void
    forceReconnectRealtimeEvents: () => void
    cleanupRealtimeEvents: () => void
    watchSessionLifecycle: (chatKey: string, sessionId: string) => void
    stopWatchingSessionLifecycle: (sessionId: string) => void

    compilePrompt: (agentId: string) => Promise<string>
}
