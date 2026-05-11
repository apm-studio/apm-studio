import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./opencode.js', () => ({
    getOpencode: vi.fn(),
}))

async function loadGlobalConfigModule() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-global-config-'))
    vi.resetModules()
    vi.doMock('./config.js', () => ({
        STUDIO_OPENCODE_CONFIG_DIR: dir,
    }))
    const mod = await import('./global-config.js')
    return { dir, mod }
}

beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./config.js')
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

afterEach(() => {
    vi.doUnmock('./config.js')
    vi.unstubAllEnvs()
})

describe('resolveGlobalConfigPath', () => {
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

describe('ensureGlobalConfigDefaults', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('seeds the pinned Anthropic auth plugin into an empty Studio-owned config', async () => {
        const { mod } = await loadGlobalConfigModule()

        await mod.ensureGlobalConfigDefaults()

        expect(await mod.readGlobalConfigFile()).toEqual({
            $schema: 'https://opencode.ai/config.json',
            plugin: ['@cortexkit/opencode-anthropic-auth@1.0.0'],
        })
    })

    it('preserves existing plugins and does not duplicate an existing CortexKit Anthropic auth plugin', async () => {
        const { mod } = await loadGlobalConfigModule()
        await mod.writeGlobalConfigFile({
            $schema: 'https://opencode.ai/config.json',
            plugin: ['opencode-helicone-session', '@cortexkit/opencode-anthropic-auth@1.0.0'],
        }, { dispose: false })

        await mod.ensureGlobalConfigDefaults()

        expect(await mod.readGlobalConfigFile()).toEqual({
            $schema: 'https://opencode.ai/config.json',
            plugin: ['opencode-helicone-session', '@cortexkit/opencode-anthropic-auth@1.0.0'],
        })
    })

    it('replaces the legacy Anthropic auth plugin with the CortexKit plugin', async () => {
        const { mod } = await loadGlobalConfigModule()
        await mod.writeGlobalConfigFile({
            $schema: 'https://opencode.ai/config.json',
            plugin: ['opencode-helicone-session', 'opencode-anthropic-auth@0.0.13'],
        }, { dispose: false })

        await mod.ensureGlobalConfigDefaults()

        expect(await mod.readGlobalConfigFile()).toEqual({
            $schema: 'https://opencode.ai/config.json',
            plugin: ['opencode-helicone-session', '@cortexkit/opencode-anthropic-auth@1.0.0'],
        })
    })
})
