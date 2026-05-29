import { beforeEach, describe, expect, it, vi } from 'vitest'

function createStorageMock(): Storage {
    const store = new Map<string, string>()

    return {
        get length() {
            return store.size
        },
        clear() {
            store.clear()
        },
        getItem(key) {
            return store.get(key) ?? null
        },
        key(index) {
            return Array.from(store.keys())[index] ?? null
        },
        removeItem(key) {
            store.delete(key)
        },
        setItem(key, value) {
            store.set(key, value)
        },
    }
}

describe('settings slice', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: createStorageMock(),
        })
        vi.resetModules()
    })

    it('starts from current UI defaults', async () => {
        const { useUISettings } = await import('./slice')
        const state = useUISettings.getState()

        expect(state.showReasoningSummaries).toBe(true)
        expect(state.shellToolPartsExpanded).toBe(true)
        expect(state.editToolPartsExpanded).toBe(false)
    })
})
