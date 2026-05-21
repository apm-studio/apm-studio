import { beforeEach, describe, expect, it, vi } from 'vitest'

const getActiveProjectDirMock = vi.fn()
const listSavedWorkspacesMock = vi.fn()
const listWorkspacePerformersForDirMock = vi.fn()
const ensureCodexPerformerProjectionMock = vi.fn()
const pruneStalePerformerProjectionsMock = vi.fn()

vi.mock('../../lib/config.js', () => ({
    getActiveProjectDir: getActiveProjectDirMock,
}))

vi.mock('../workspace-service.js', () => ({
    listSavedWorkspaces: listSavedWorkspacesMock,
    listWorkspacePerformersForDir: listWorkspacePerformersForDirMock,
}))

vi.mock('./stage-projection-service.js', () => ({
    ensureCodexPerformerProjection: ensureCodexPerformerProjectionMock,
    pruneStalePerformerProjections: pruneStalePerformerProjectionsMock,
}))

describe('performer projection startup sync', () => {
    beforeEach(() => {
        getActiveProjectDirMock.mockReset().mockReturnValue('/workspaces/active')
        listSavedWorkspacesMock.mockReset().mockResolvedValue([
            { id: 'active', workingDir: '/workspaces/active', updatedAt: 2 },
            { id: 'saved', workingDir: '/workspaces/saved', updatedAt: 1 },
        ])
        pruneStalePerformerProjectionsMock.mockReset().mockResolvedValue(false)
        ensureCodexPerformerProjectionMock.mockReset().mockResolvedValue({
            changed: false,
            codexChanged: false,
            skipped: false,
        })
        listWorkspacePerformersForDirMock.mockReset().mockImplementation(async (workingDir: string) => {
            if (workingDir === '/workspaces/active') {
                return [
                    {
                        id: 'reviewer',
                        name: 'Reviewer',
                        model: { provider: 'openai', modelId: 'gpt-5.4' },
                        modelVariant: 'reasoning-high',
                        talRef: { kind: 'draft', draftId: 'tal-1' },
                        danceRefs: [{ kind: 'draft', draftId: 'dance-1' }],
                        mcpServerNames: ['github'],
                    },
                    {
                        id: 'drafting',
                        name: 'Drafting',
                        model: null,
                        danceRefs: [],
                        mcpServerNames: [],
                    },
                ]
            }

            return [
                {
                    id: 'spark',
                    name: 'Spark',
                    model: { provider: 'openai', modelId: 'gpt-5.3-codex-spark' },
                    talRef: null,
                    danceRefs: [],
                    mcpServerNames: [],
                },
            ]
        })
    })

    it('syncs active and saved workspace performers on server startup', async () => {
        ensureCodexPerformerProjectionMock
            .mockResolvedValueOnce({ changed: true, codexChanged: true, skipped: false })
            .mockResolvedValueOnce({ changed: false, codexChanged: true, skipped: false })
        pruneStalePerformerProjectionsMock
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true)

        const { syncPerformerProjectionsOnServerStartup } = await import('./performer-startup-service.js')

        const summary = await syncPerformerProjectionsOnServerStartup()

        expect(listWorkspacePerformersForDirMock).toHaveBeenCalledTimes(2)
        expect(listWorkspacePerformersForDirMock).toHaveBeenNthCalledWith(1, '/workspaces/active')
        expect(listWorkspacePerformersForDirMock).toHaveBeenNthCalledWith(2, '/workspaces/saved')
        expect(pruneStalePerformerProjectionsMock).toHaveBeenNthCalledWith(1, '/workspaces/active', ['reviewer', 'drafting'])
        expect(pruneStalePerformerProjectionsMock).toHaveBeenNthCalledWith(2, '/workspaces/saved', ['spark'])
        expect(ensureCodexPerformerProjectionMock).toHaveBeenCalledTimes(2)
        expect(ensureCodexPerformerProjectionMock).toHaveBeenNthCalledWith(1, {
            performerId: 'reviewer',
            performerName: 'Reviewer',
            talRef: { kind: 'draft', draftId: 'tal-1' },
            danceRefs: [{ kind: 'draft', draftId: 'dance-1' }],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: 'reasoning-high',
            mcpServerNames: ['github'],
            workingDir: '/workspaces/active',
            scope: 'workspace',
        })
        expect(ensureCodexPerformerProjectionMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
            performerId: 'spark',
            model: { provider: 'openai', modelId: 'gpt-5.3-codex-spark' },
            workingDir: '/workspaces/saved',
            scope: 'workspace',
        }))
        expect(summary).toEqual({
            workspaceCount: 2,
            performerCount: 3,
            projectedCount: 2,
            skippedCount: 1,
            failedCount: 0,
            changedCount: 1,
            codexChangedCount: 2,
            prunedWorkspaceCount: 1,
        })
    })

    it('continues syncing remaining performers when one performer fails', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        listSavedWorkspacesMock.mockResolvedValueOnce([])
        listWorkspacePerformersForDirMock.mockResolvedValueOnce([
            {
                id: 'broken',
                name: 'Broken',
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                talRef: null,
                danceRefs: [],
                mcpServerNames: [],
            },
            {
                id: 'healthy',
                name: 'Healthy',
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                talRef: null,
                danceRefs: [],
                mcpServerNames: [],
            },
        ])
        ensureCodexPerformerProjectionMock
            .mockRejectedValueOnce(new Error('projection failed'))
            .mockResolvedValueOnce({ changed: false, codexChanged: true, skipped: false })

        try {
            const { syncPerformerProjectionsOnServerStartup } = await import('./performer-startup-service.js')

            const summary = await syncPerformerProjectionsOnServerStartup()

            expect(ensureCodexPerformerProjectionMock).toHaveBeenCalledTimes(2)
            expect(summary).toEqual({
                workspaceCount: 1,
                performerCount: 2,
                projectedCount: 1,
                skippedCount: 0,
                failedCount: 1,
                changedCount: 0,
                codexChangedCount: 1,
                prunedWorkspaceCount: 0,
            })
        } finally {
            warnSpy.mockRestore()
        }
    })
})
