import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resolveGlobalConfigPath', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('uses the Studio-owned OpenCode config path', async () => {
        vi.stubEnv('APM_STUDIO_HOME', '/tmp/apm-studio')
        const { resolveGlobalConfigPath } = await import('./global-config.js')

        expect(resolveGlobalConfigPath()).toBe(path.join('/tmp/apm-studio', 'opencode', 'opencode.json'))
    })

    it('ignores external OpenCode config environment variables', async () => {
        vi.stubEnv('APM_STUDIO_HOME', '/tmp/apm-studio')
        vi.stubEnv('OPENCODE_CONFIG_DIR', '/tmp/external-opencode')
        vi.stubEnv('XDG_CONFIG_HOME', '/tmp/xdg-config')
        vi.stubEnv('OPENCODE_URL', 'http://localhost:9999')
        const { resolveGlobalConfigPath } = await import('./global-config.js')

        expect(resolveGlobalConfigPath()).toBe(path.join('/tmp/apm-studio', 'opencode', 'opencode.json'))
    })
})
