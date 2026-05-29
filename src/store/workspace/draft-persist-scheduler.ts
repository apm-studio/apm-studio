const draftPersistTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleDraftPersist(draftId: string, fn: () => void, delay = 1500) {
    const existing = draftPersistTimers.get(draftId)
    if (existing) clearTimeout(existing)
    draftPersistTimers.set(draftId, setTimeout(() => {
        draftPersistTimers.delete(draftId)
        fn()
    }, delay))
}
