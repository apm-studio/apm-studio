export type PerformerProjectionStartupSummary = {
    workspaceCount: number
    performerCount: number
    projectedCount: number
    skippedCount: number
    failedCount: number
    changedCount: number
    codexChangedCount: number
    prunedWorkspaceCount: number
}

function emptySummary(): PerformerProjectionStartupSummary {
    return {
        workspaceCount: 0,
        performerCount: 0,
        projectedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        changedCount: 0,
        codexChangedCount: 0,
        prunedWorkspaceCount: 0,
    }
}

export async function syncWorkspacePerformerProjectionsOnStartup(
    _workingDir: string,
): Promise<PerformerProjectionStartupSummary> {
    const summary = emptySummary()
    summary.workspaceCount = 1
    return summary
}

export async function syncPerformerProjectionsOnServerStartup(): Promise<PerformerProjectionStartupSummary> {
    return emptySummary()
}
