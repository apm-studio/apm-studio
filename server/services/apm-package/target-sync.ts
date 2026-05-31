import type {
    ApmSyncRunRequest,
    ApmSyncRunResponse,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetId,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-sync-contracts.js'
import {
    listSyncTargetProfiles,
} from './sync-targets.js'
import { getApmToolingStatus } from './tooling.js'
import { collectTargetDefinitions } from './target-definitions.js'
import {
    emptySyncOwnershipManifest,
    readSyncOwnershipManifest,
    summarizeSyncTargetItems,
} from './sync-ownership.js'
import { planApmTargetSync } from './target-sync-plan.js'
import { runApmTargetSyncJob } from './target-sync-execution.js'

export async function getApmSyncTargets(workingDir?: string): Promise<ApmSyncTargetsResponse> {
    const tooling = await getApmToolingStatus()
    const ownership = workingDir ? await readSyncOwnershipManifest(workingDir) : emptySyncOwnershipManifest()
    const profiles = listSyncTargetProfiles()
    const definitionsByTarget = new Map<ApmSyncTargetId, ApmSyncTargetDefinitionSummary[]>()
    if (workingDir) {
        await Promise.all(profiles.map(async (target) => {
            definitionsByTarget.set(target.id, await collectTargetDefinitions(workingDir, target.id, ownership))
        }))
    }
    return {
        tooling: {
            ...tooling,
            deploymentNote: 'APM Studio exports Studio Agents and APM primitives with an APM CLI-first pipeline. Studio fallback handles supported agent and skill projections when the CLI path is unavailable.',
        },
        targets: profiles.map((target) => ({
            id: target.id,
            label: target.label,
            description: target.description,
            outputHint: target.outputHint,
            available: true,
            commandPreview: `${tooling.recommendedCommand || 'Studio fallback'} install <package> --target ${target.id}`,
            supportedSyncUnits: target.supportedSyncUnits,
            strategy: target.strategy,
            currentItems: summarizeSyncTargetItems(ownership, target.id),
            definitions: definitionsByTarget.get(target.id) || [],
        })),
    }
}

export async function runApmTargetSync(
    workingDir: string,
    request: ApmSyncRunRequest,
): Promise<ApmSyncRunResponse> {
    const plan = await planApmTargetSync(workingDir, request)
    const startedAt = Date.now()
    const results: ApmSyncRunResponse['results'] = []
    for (const job of plan.jobs) {
        if (job.kind === 'skip') {
            results.push(job.result)
        } else {
            results.push(await runApmTargetSyncJob(workingDir, job))
        }
    }

    return {
        ok: true,
        targets: plan.targets,
        syncUnit: plan.syncUnit,
        startedAt,
        finishedAt: Date.now(),
        results,
    }
}
