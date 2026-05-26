import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resolveDotCommand', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('does not resolve the legacy sibling dot checkout in dev mode', async () => {
        vi.stubEnv('AGENT_ROASTER_PRODUCTION', '0')

        const { resolveDotCommand } = await import('./dot-loader.js')

        expect(resolveDotCommand().join(' ')).not.toContain('dot/src/cli/dot.ts')
    })

    it('uses the Agent Roaster package command in production mode', async () => {
        vi.stubEnv('AGENT_ROASTER_PRODUCTION', '1')

        const { resolveDotCommand } = await import('./dot-loader.js')

        expect(resolveDotCommand()[0]).not.toBe('dance-of-tal')
    })
})
