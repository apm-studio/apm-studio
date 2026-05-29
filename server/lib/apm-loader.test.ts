import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resolveApmCommand', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('uses the repo-local package command in dev mode', async () => {
        vi.stubEnv('APM_STUDIO_PRODUCTION', '0')

        const { resolveApmCommand } = await import('./apm-loader.js')

        expect(resolveApmCommand()[0]).toMatch(/(apm-studio|cli\.js)$/)
    })

    it('uses a packaged command path in production mode', async () => {
        vi.stubEnv('APM_STUDIO_PRODUCTION', '1')

        const { resolveApmCommand } = await import('./apm-loader.js')

        expect(resolveApmCommand()[0]).toMatch(/(apm-studio|cli\.js)$/)
    })
})
