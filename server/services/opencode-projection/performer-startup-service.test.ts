import { describe, expect, it } from 'vitest'

describe('performer projection startup sync', () => {
    it('does not prewarm external agent projections on server startup', async () => {
        const { syncPerformerProjectionsOnServerStartup } = await import('./performer-startup-service.js')

        await expect(syncPerformerProjectionsOnServerStartup()).resolves.toEqual({
            workspaceCount: 0,
            performerCount: 0,
            projectedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            changedCount: 0,
            codexChangedCount: 0,
            prunedWorkspaceCount: 0,
        })
    })

    it('keeps the per-workspace startup hook non-mutating for compatibility', async () => {
        const { syncWorkspacePerformerProjectionsOnStartup } = await import('./performer-startup-service.js')

        await expect(syncWorkspacePerformerProjectionsOnStartup('/workspaces/active')).resolves.toEqual({
            workspaceCount: 1,
            performerCount: 0,
            projectedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            changedCount: 0,
            codexChangedCount: 0,
            prunedWorkspaceCount: 0,
        })
    })
})
