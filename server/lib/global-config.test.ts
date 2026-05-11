import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resolveGlobalConfigPath', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('uses the Studio-owned OpenCode config path', async () => {
        vi.stubEnv('STUDIO_DIR', '/tmp/dot-studio')
        const { resolveGlobalConfigPath } = await import('./global-config.js')

        expect(resolveGlobalConfigPath()).toBe(path.join('/tmp/dot-studio', 'opencode', 'opencode.json'))
    })

    it('ignores external OpenCode config environment variables', async () => {
        vi.stubEnv('STUDIO_DIR', '/tmp/dot-studio')
        vi.stubEnv('OPENCODE_CONFIG_DIR', '/tmp/external-opencode')
        vi.stubEnv('XDG_CONFIG_HOME', '/tmp/xdg-config')
        vi.stubEnv('OPENCODE_URL', 'http://localhost:9999')
        const { resolveGlobalConfigPath } = await import('./global-config.js')

        expect(resolveGlobalConfigPath()).toBe(path.join('/tmp/dot-studio', 'opencode', 'opencode.json'))
    })
})
