import { beforeEach, describe, expect, it, vi } from 'vitest'

const readStudioConfigMock = vi.fn()
const writeStudioConfigMock = vi.fn()
const getExplicitActiveProjectDirMock = vi.fn()
const getActiveProjectDirMock = vi.fn()
const setActiveProjectDirMock = vi.fn()
const ensureApmAssetDirMock = vi.fn()
const invalidateAllMock = vi.fn()

vi.mock('../lib/config.js', () => ({
    readStudioConfig: readStudioConfigMock,
    writeStudioConfig: writeStudioConfigMock,
    getExplicitActiveProjectDir: getExplicitActiveProjectDirMock,
    getActiveProjectDir: getActiveProjectDirMock,
    setActiveProjectDir: setActiveProjectDirMock,
}))

vi.mock('../lib/apm-asset-source.js', () => ({
    ensureApmAssetDir: ensureApmAssetDirMock,
}))

vi.mock('../lib/cache.js', () => ({
    invalidateAll: invalidateAllMock,
}))

vi.mock('open', () => ({
    default: vi.fn(),
}))

describe('getStudioConfig', () => {
    beforeEach(() => {
        readStudioConfigMock.mockReset().mockResolvedValue({ theme: 'dark', lastWorkspaceId: 'workspace-1' })
        writeStudioConfigMock.mockReset()
        getExplicitActiveProjectDirMock.mockReset().mockReturnValue(null)
        getActiveProjectDirMock.mockReset().mockReturnValue('/tmp/workspace')
        setActiveProjectDirMock.mockReset()
        ensureApmAssetDirMock.mockReset()
        invalidateAllMock.mockReset()
    })

    it('does not expose the server fallback project directory before a workspace is explicitly activated', async () => {
        const { getStudioConfig } = await import('./studio-service.js')

        await expect(getStudioConfig()).resolves.toEqual({
            theme: 'dark',
            lastWorkspaceId: 'workspace-1',
        })
    })

    it('returns the explicit active workspace directory once Studio has activated one', async () => {
        getExplicitActiveProjectDirMock.mockReturnValue('/tmp/workspace')

        const { getStudioConfig } = await import('./studio-service.js')

        await expect(getStudioConfig()).resolves.toEqual({
            theme: 'dark',
            lastWorkspaceId: 'workspace-1',
            projectDir: '/tmp/workspace',
        })
    })
})

describe('initializeStudioProject', () => {
    beforeEach(() => {
        readStudioConfigMock.mockReset().mockResolvedValue({ theme: 'dark', lastWorkspaceId: 'workspace-1' })
        writeStudioConfigMock.mockReset()
        getExplicitActiveProjectDirMock.mockReset().mockReturnValue(null)
        getActiveProjectDirMock.mockReset().mockReturnValue('/tmp/workspace')
        setActiveProjectDirMock.mockReset()
        ensureApmAssetDirMock.mockReset()
        invalidateAllMock.mockReset()
    })

    it('primes the requested workspace directory for CLI startup restore', async () => {
        const { initializeStudioProject } = await import('./studio-service.js')

        await expect(initializeStudioProject('/tmp/workspace/')).resolves.toBe('/tmp/workspace')

        expect(ensureApmAssetDirMock).toHaveBeenCalledWith('/tmp/workspace')
        expect(setActiveProjectDirMock).toHaveBeenCalledWith('/tmp/workspace')
        expect(invalidateAllMock).toHaveBeenCalledTimes(1)
    })
})
