import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resolveRosterCommand', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('does not resolve the legacy sibling dot checkout in dev mode', async () => {
        vi.stubEnv('AGENT_ROSTER_PRODUCTION', '0')

        const { resolveRosterCommand } = await import('./roster-loader.js')

        expect(resolveRosterCommand().join(' ')).not.toContain('dot/src/cli/dot.ts')
    })

    it('uses the Agent Roster package command in production mode', async () => {
        vi.stubEnv('AGENT_ROSTER_PRODUCTION', '1')

        const { resolveRosterCommand } = await import('./roster-loader.js')

        expect(resolveRosterCommand()[0]).not.toBe('dance-of-tal')
    })
})
