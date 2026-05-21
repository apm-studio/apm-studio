import { getActiveProjectDir } from '../../lib/config.js'
import {
    listSavedWorkspaces,
    listWorkspacePerformersForDir,
    type WorkspacePerformerSnapshot,
} from '../workspace-service.js'
import {
    ensureCodexPerformerProjection,
    pruneStalePerformerProjections,
    type PerformerProjectionInput,
} from './stage-projection-service.js'

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

function mergeSummary(
    target: PerformerProjectionStartupSummary,
    source: PerformerProjectionStartupSummary,
) {
    target.workspaceCount += source.workspaceCount
    target.performerCount += source.performerCount
    target.projectedCount += source.projectedCount
    target.skippedCount += source.skippedCount
    target.failedCount += source.failedCount
    target.changedCount += source.changedCount
    target.codexChangedCount += source.codexChangedCount
    target.prunedWorkspaceCount += source.prunedWorkspaceCount
}

function uniqueNonEmptyDirs(directories: Array<string | null | undefined>) {
    return Array.from(new Set(
        directories
            .map((directory) => (typeof directory === 'string' ? directory.trim() : ''))
            .filter(Boolean),
    ))
}

function performerToProjectionInput(
    performer: WorkspacePerformerSnapshot,
    workingDir: string,
): PerformerProjectionInput | null {
    if (!performer.model) {
        return null
    }

    return {
        performerId: performer.id,
        performerName: performer.name,
        talRef: performer.talRef || null,
        danceRefs: performer.danceRefs || [],
        model: performer.model,
        modelVariant: performer.modelVariant || null,
        mcpServerNames: performer.mcpServerNames || [],
        workingDir,
        scope: 'workspace',
    }
}

export async function syncWorkspacePerformerProjectionsOnStartup(
    workingDir: string,
): Promise<PerformerProjectionStartupSummary> {
    const summary = emptySummary()
    summary.workspaceCount = 1

    const performers = await listWorkspacePerformersForDir(workingDir)
    summary.performerCount = performers.length

    const performerIds = performers.map((performer) => performer.id)
    try {
        if (await pruneStalePerformerProjections(workingDir, performerIds)) {
            summary.prunedWorkspaceCount += 1
        }
    } catch (error) {
        console.warn('[performer-startup] Failed to prune stale performer projections', {
            workingDir,
            error,
        })
    }

    for (const performer of performers) {
        const projectionInput = performerToProjectionInput(performer, workingDir)
        if (!projectionInput) {
            summary.skippedCount += 1
            continue
        }

        try {
            const projection = await ensureCodexPerformerProjection(projectionInput)
            if (projection.skipped) {
                summary.skippedCount += 1
            } else {
                summary.projectedCount += 1
            }
            if (projection.changed) {
                summary.changedCount += 1
            }
            if (projection.codexChanged) {
                summary.codexChangedCount += 1
            }
        } catch (error) {
            summary.failedCount += 1
            console.warn('[performer-startup] Failed to sync performer projection', {
                workingDir,
                performerId: performer.id,
                error,
            })
        }
    }

    return summary
}

export async function syncPerformerProjectionsOnServerStartup(): Promise<PerformerProjectionStartupSummary> {
    const summary = emptySummary()
    const savedWorkspaces = await listSavedWorkspaces(true).catch(() => [])
    const candidateDirs = uniqueNonEmptyDirs([
        getActiveProjectDir(),
        ...savedWorkspaces.map((workspace) => workspace.workingDir),
    ])

    for (const directory of candidateDirs) {
        try {
            mergeSummary(summary, await syncWorkspacePerformerProjectionsOnStartup(directory))
        } catch (error) {
            summary.workspaceCount += 1
            summary.failedCount += 1
            console.warn('[performer-startup] Failed to sync workspace performer projections', {
                directory,
                error,
            })
        }
    }

    return summary
}
