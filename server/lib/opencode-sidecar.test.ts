import { afterEach, describe, expect, it, vi } from 'vitest'

describe('isOpencodeReachable', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
        vi.resetModules()
    })

    it('checks the OpenCode global health endpoint for sidecar readiness', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true }) as Response)
        vi.stubEnv('OPENCODE_PORT', '43155')
        vi.stubGlobal('fetch', fetchMock)

        const { isOpencodeReachable } = await import('./opencode-sidecar.js')

        await expect(isOpencodeReachable()).resolves.toBe(true)
        const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined
        expect(String(firstCall?.[0])).toBe('http://localhost:43155/global/health')
    })

    it('reuses a reachable sidecar on the managed port instead of spawning a duplicate', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true }) as Response)
        const spawnMock = vi.fn()
        vi.stubEnv('OPENCODE_PORT', '43156')
        vi.stubGlobal('fetch', fetchMock)
        vi.doMock('child_process', async (importOriginal) => ({
            ...await importOriginal<typeof import('child_process')>(),
            spawn: spawnMock as unknown as typeof import('child_process').spawn,
        }))

        const { canRestartOpencodeSidecar, ensureOpencodeSidecar } = await import('./opencode-sidecar.js')

        await expect(ensureOpencodeSidecar()).resolves.toBeUndefined()
        expect(spawnMock).not.toHaveBeenCalled()
        expect(canRestartOpencodeSidecar()).toBe(false)
    })
})
