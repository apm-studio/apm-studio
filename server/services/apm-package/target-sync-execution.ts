import path from 'path'
import type {
    ApmSyncPackageResult,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts.js'
import { runApmCliInstall, selectApmCliRunner } from './apm-cli-runner.js'
import { applyCliArtifacts } from './sync-cli-artifacts.js'
import {
    createSyncTempPackage,
    removeSyncTempPackage,
} from './sync-temp-package.js'
import { syncTargetProfile } from './sync-targets.js'
import { syncPackageWithStudioFallback } from './studio-fallback-sync.js'
import type { RunnableApmSyncJob } from './target-sync-plan.js'

function packageDisplayName(job: RunnableApmSyncJob) {
    return job.package.agentName || job.package.name
}

async function runCliFirstSync(
    workingDir: string,
    job: RunnableApmSyncJob,
): Promise<ApmSyncPackageResult> {
    const runner = await selectApmCliRunner()
    if (!runner) {
        throw new Error('No APM CLI runner is available.')
    }

    const tempPackage = await createSyncTempPackage(
        workingDir,
        job.package.packageId,
        job.syncUnit,
    )
    try {
        const result = await runApmCliInstall(runner, tempPackage.packageRoot, job.target, {
            cwd: tempPackage.workspaceDir,
            env: {
                HOME: tempPackage.homeDir,
                APM_CACHE_DIR: path.join(tempPackage.rootDir, 'cache'),
            },
        })
        const artifacts = await applyCliArtifacts(
            tempPackage,
            workingDir,
            job.package.packageId,
            job.target,
            job.syncUnit,
        )
        return {
            packageId: job.package.packageId,
            name: packageDisplayName(job),
            target: job.target,
            syncUnit: job.syncUnit,
            command: result.command,
            status: artifacts.length > 0 ? 'synced' : 'skipped',
            projectedAs: `${syncTargetProfile(job.target).label} ${job.syncUnit}`,
            artifacts,
            warnings: artifacts.length > 0
                ? []
                : ['APM CLI completed but produced no project-scoped artifacts for this target.'],
            stdout: result.stdout || artifacts.join('\n'),
            stderr: result.stderr || undefined,
            modelOmitted: true,
        }
    } finally {
        await removeSyncTempPackage(tempPackage)
    }
}

async function runStudioFallback(
    workingDir: string,
    job: RunnableApmSyncJob,
    reason: string,
): Promise<ApmSyncPackageResult> {
    if (job.syncUnit === 'instructions' || job.syncUnit === 'mcp') {
        return {
            packageId: job.package.packageId,
            name: packageDisplayName(job),
            target: job.target,
            syncUnit: job.syncUnit,
            command: `apm-studio fallback ${job.package.packageId} --target ${job.target} --unit ${job.syncUnit}`,
            status: 'skipped',
            projectedAs: `${syncTargetProfile(job.target).label} ${job.syncUnit}`,
            warnings: [reason, `Studio fallback does not sync ${job.syncUnit} yet.`],
        }
    }

    const fallbackUnit: ApmSyncUnit = job.syncUnit === 'agent-packages'
        ? 'agent-packages'
        : job.syncUnit
    const result = await syncPackageWithStudioFallback(
        workingDir,
        job.package.packageId,
        job.target,
        fallbackUnit,
    )
    return {
        ...result,
        syncUnit: job.syncUnit,
        warnings: [
            reason,
            ...(result.warnings || []),
        ],
    }
}

export async function runApmTargetSyncJob(
    workingDir: string,
    job: RunnableApmSyncJob,
): Promise<ApmSyncPackageResult> {
    try {
        return await runCliFirstSync(workingDir, job)
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'APM CLI sync failed.'
        try {
            return await runStudioFallback(workingDir, job, reason)
        } catch (fallbackError) {
            return {
                packageId: job.package.packageId,
                name: packageDisplayName(job),
                target: job.target,
                syncUnit: job.syncUnit,
                command: `apm-studio fallback ${job.package.packageId} --target ${job.target} --unit ${job.syncUnit}`,
                status: 'failed',
                error: fallbackError instanceof Error ? fallbackError.message : 'Studio fallback failed.',
                warnings: [reason],
            }
        }
    }
}
