import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resolveRosterCommand', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('uses the repo-local package command in dev mode', async () => {
        vi.stubEnv('EIGHTPM_STUDIO_PRODUCTION', '0')

        const { resolveRosterCommand } = await import('./roster-loader.js')

        expect(resolveRosterCommand()[0]).toMatch(/(8pm-studio|cli\.js)$/)
    })

    it('uses the 8PM Studio package command in production mode', async () => {
        vi.stubEnv('EIGHTPM_STUDIO_PRODUCTION', '1')

        const { resolveRosterCommand } = await import('./roster-loader.js')

        expect(resolveRosterCommand()[0]).not.toBe('dance-of-tal')
    })
})
