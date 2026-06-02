import fs from 'fs/promises'
import path from 'path'
import type {
    ApmSyncTargetId,
    ApmSyncUnit,
    ApmSyncPackageResult,
} from '../../../shared/apm-sync-contracts.js'
import {
    type ApmCliRunner,
    runApmCliInstall,
    selectApmCliRunner,
} from './apm-cli-runner.js'
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

const SHARED_TARGET_STATE_FILES: Partial<Record<ApmSyncUnit, Partial<Record<ApmSyncTargetId, string[]>>>> = {
    hooks: {
        claude: ['.claude/settings.json', '.claude/apm-hooks.json'],
        codex: ['.codex/hooks.json'],
        cursor: ['.cursor/hooks.json'],
        gemini: ['.gemini/settings.json'],
        windsurf: ['.windsurf/hooks.json'],
    },
    mcp: {
        codex: ['.codex/config.toml', '.codex/mcp.json'],
        claude: ['.mcp.json', '.claude/mcp.json'],
        opencode: ['opencode.json', '.opencode/opencode.json'],
        cursor: ['.cursor/mcp.json'],
        windsurf: ['.windsurf/mcp_config.json'],
        copilot: ['.github/mcp.json', '.vscode/mcp.json'],
        gemini: ['.gemini/settings.json', '.gemini/mcp.json'],
    },
}

async function seedExistingSharedTargetState(
    workingDir: string,
    tempWorkspace: string,
    job: RunnableApmSyncJob,
) {
    const files = SHARED_TARGET_STATE_FILES[job.syncUnit]?.[job.target] || []
    await Promise.all(files.map(async (relativePath) => {
        const source = path.join(workingDir, relativePath)
        const stat = await fs.stat(source).catch(() => null)
        if (!stat?.isFile()) return
        const target = path.join(tempWorkspace, relativePath)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.copyFile(source, target)
    }))
}

async function runCliFirstSync(
    workingDir: string,
    job: RunnableApmSyncJob,
    runner: ApmCliRunner,
): Promise<ApmSyncPackageResult> {
    const tempPackage = await createSyncTempPackage(
        workingDir,
        job.package.packageId,
        job.syncUnit,
    )
    try {
        const targetProfile = syncTargetProfile(job.target)
        await Promise.all(targetProfile.artifactRoots.map((root) =>
            fs.mkdir(path.join(tempPackage.workspaceDir, root), { recursive: true }),
        ))
        await seedExistingSharedTargetState(workingDir, tempPackage.workspaceDir, job)
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

function cliInstallPreview(runner: ApmCliRunner, target: string) {
    return [runner.displayCommand, 'install', '<package>', '--target', target].join(' ')
}

function cliFailureResult(
    job: RunnableApmSyncJob,
    runner: ApmCliRunner,
    error: unknown,
): ApmSyncPackageResult {
    return {
        packageId: job.package.packageId,
        name: packageDisplayName(job),
        target: job.target,
        syncUnit: job.syncUnit,
        command: cliInstallPreview(runner, job.target),
        status: 'failed',
        projectedAs: `${syncTargetProfile(job.target).label} ${job.syncUnit}`,
        error: error instanceof Error ? error.message : 'APM CLI sync failed.',
        warnings: [
            'APM CLI was selected, so Studio did not replace the failed APM output with a fallback projection.',
        ],
        modelOmitted: true,
    }
}

async function runStudioFallback(
    workingDir: string,
    job: RunnableApmSyncJob,
    reason: string,
): Promise<ApmSyncPackageResult> {
    if (
        job.syncUnit === 'instructions'
        || job.syncUnit === 'prompts'
        || job.syncUnit === 'commands'
        || job.syncUnit === 'hooks'
        || job.syncUnit === 'mcp'
    ) {
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

    const result = await syncPackageWithStudioFallback(
        workingDir,
        job.package.packageId,
        job.target,
        job.syncUnit,
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
    const runner = await selectApmCliRunner()
    if (!runner) {
        const reason = 'No APM CLI runner is available.'
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

    try {
        return await runCliFirstSync(workingDir, job, runner)
    } catch (error) {
        return cliFailureResult(job, runner, error)
    }
}
