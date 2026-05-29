import { afterEach, describe, expect, it, vi } from 'vitest'
import { isVerboseServerLoggingEnabled, shouldLogRequest } from './server-logger.js'

describe('shouldLogRequest', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('skips healthy fast requests on quiet health endpoints', () => {
        expect(shouldLogRequest('/health', 200, 20)).toBe(false)
        expect(shouldLogRequest('/api/health', 204, 50)).toBe(false)
    })

    it('logs warnings for client errors and slow requests', () => {
        expect(shouldLogRequest('/api/chat', 404, 15)).toBe(true)
        expect(shouldLogRequest('/api/chat', 200, 1200)).toBe(true)
    })

    it('always logs server errors, including on health endpoints', () => {
        expect(shouldLogRequest('/health', 500, 10)).toBe(true)
    })

    it('uses only the current APM Studio verbose logging environment variable', () => {
        vi.stubEnv('STUDIO_VERBOSE_SERVER_LOGS', '1')
        vi.stubEnv('APM_STUDIO_VERBOSE_SERVER_LOGS', '')
        expect(isVerboseServerLoggingEnabled()).toBe(false)

        vi.stubEnv('APM_STUDIO_VERBOSE_SERVER_LOGS', '1')
        expect(isVerboseServerLoggingEnabled()).toBe(true)
    })
})
