import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    STUDIO_DEV_API_PORT,
    STUDIO_DEV_OPENCODE_PORT,
    STUDIO_RELEASE_APP_PORT,
    STUDIO_RELEASE_OPENCODE_PORT,
} from '../../shared/default-ports.js'

describe('server config mode and port resolution', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('defaults to dev mode with the dev API port and parent project fallback', async () => {
        vi.stubEnv('APM_STUDIO_PRODUCTION', '')
        vi.stubEnv('PORT', '')
        vi.stubEnv('APM_STUDIO_PROJECT_DIR', '')
        vi.stubEnv('OPENCODE_PORT', '')

        const config = await import('./config.js')

        expect(config.IS_PRODUCTION).toBe(false)
        expect(config.PORT).toBe(STUDIO_DEV_API_PORT)
        expect(config.OPENCODE_PORT).toBe(STUDIO_DEV_OPENCODE_PORT)
        expect(config.DEFAULT_PROJECT_DIR).toBe(path.resolve(process.cwd(), '..'))
    })

    it('defaults production mode to the published CLI port set', async () => {
        vi.stubEnv('APM_STUDIO_PRODUCTION', '1')
        vi.stubEnv('PORT', '')
        vi.stubEnv('APM_STUDIO_PROJECT_DIR', '')
        vi.stubEnv('OPENCODE_PORT', '')

        const config = await import('./config.js')

        expect(config.IS_PRODUCTION).toBe(true)
        expect(config.PORT).toBe(STUDIO_RELEASE_APP_PORT)
        expect(config.OPENCODE_PORT).toBe(STUDIO_RELEASE_OPENCODE_PORT)
        expect(config.DEFAULT_PROJECT_DIR).toBe(path.resolve(process.cwd()))
    })

    it('uses production mode only for an explicit production flag', async () => {
        vi.stubEnv('APM_STUDIO_PRODUCTION', '1')
        vi.stubEnv('APM_STUDIO_PROJECT_DIR', '/tmp/apm-studio-project')
        vi.stubEnv('PORT', '43170')
        vi.stubEnv('OPENCODE_PORT', '43171')

        const config = await import('./config.js')

        expect(config.IS_PRODUCTION).toBe(true)
        expect(config.PORT).toBe(43170)
        expect(config.OPENCODE_PORT).toBe(43171)
        expect(config.DEFAULT_PROJECT_DIR).toBe('/tmp/apm-studio-project')
    })

    it('lets the APM production flag explicitly disable production mode', async () => {
        vi.stubEnv('APM_STUDIO_PRODUCTION', '0')
        vi.stubEnv('PORT', '')
        vi.stubEnv('APM_STUDIO_PROJECT_DIR', '')
        vi.stubEnv('OPENCODE_PORT', '')

        const config = await import('./config.js')

        expect(config.IS_PRODUCTION).toBe(false)
        expect(config.PORT).toBe(STUDIO_DEV_API_PORT)
        expect(config.OPENCODE_PORT).toBe(STUDIO_DEV_OPENCODE_PORT)
        expect(config.DEFAULT_PROJECT_DIR).toBe(path.resolve(process.cwd(), '..'))
    })

    it('rejects malformed port environment values', async () => {
        vi.stubEnv('PORT', '12abc')

        await expect(import('./config.js')).rejects.toThrow('Invalid PORT: 12abc')
    })

    it('rejects out-of-range sidecar port environment values', async () => {
        vi.stubEnv('OPENCODE_PORT', '99999')

        await expect(import('./config.js')).rejects.toThrow('Invalid OPENCODE_PORT: 99999')
    })
})
