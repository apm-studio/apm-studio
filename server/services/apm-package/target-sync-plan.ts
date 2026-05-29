import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts.js'
import type {
    ApmSyncPackageResult,
    ApmSyncRunRequest,
    ApmSyncTargetId,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts.js'
import {
    apmPackageHasSyncUnit,
    apmPackageSyncUnits,
    DEFAULT_APM_SYNC_UNIT,
    normalizeApmSyncUnit,
} from '../../../shared/apm-sync-contracts.js'
import { listApmPackages } from './repository.js'
import { syncTargetProfile, targetSupportsSyncUnit } from './sync-targets.js'

export type RunnableApmSyncJob = {
    kind: 'run'
    package: ApmPackageSummary
    target: ApmSyncTargetId
    syncUnit: ApmSyncUnit
}

export type SkippedApmSyncJob = {
    kind: 'skip'
    result: ApmSyncPackageResult
}

export type PlannedApmSyncJob = RunnableApmSyncJob | SkippedApmSyncJob

export type ApmTargetSyncPlan = {
    targets: ApmSyncTargetId[]
    syncUnit: ApmSyncUnit
    jobs: PlannedApmSyncJob[]
}

function assertTarget(value: string): asserts value is ApmSyncTargetId {
    syncTargetProfile(value as ApmSyncTargetId)
}

function packageDisplayName(pkg: ApmPackageSummary) {
    return pkg.agentName || pkg.name
}

function syncCommand(pkg: ApmPackageSummary, target: ApmSyncTargetId, syncUnit: ApmSyncUnit) {
    return `apm-studio sync ${pkg.packageId} --target ${target} --unit ${syncUnit}`
}

function skippedResult(
    pkg: ApmPackageSummary,
    target: ApmSyncTargetId,
    syncUnit: ApmSyncUnit,
    warnings: string[],
): ApmSyncPackageResult {
    return {
        packageId: pkg.packageId,
        name: packageDisplayName(pkg),
        target,
        syncUnit,
        command: syncCommand(pkg, target, syncUnit),
        status: 'skipped',
        projectedAs: `${syncTargetProfile(target).label} ${syncUnit}`,
        warnings,
    }
}

export function normalizeSyncTargets(values: ApmSyncRunRequest['targets']) {
    const targets: ApmSyncTargetId[] = []
    const seen = new Set<string>()
    for (const value of values) {
        assertTarget(value)
        if (seen.has(value)) continue
        seen.add(value)
        targets.push(value)
    }
    if (targets.length === 0) {
        throw new Error('At least one APM sync target is required.')
    }
    return targets
}

export function normalizeRequestedSyncUnit(value: ApmSyncRunRequest['syncUnit']) {
    if (value === undefined) {
        return DEFAULT_APM_SYNC_UNIT
    }
    const syncUnit = normalizeApmSyncUnit(value)
    if (!syncUnit) {
        throw new Error(`Unsupported APM sync unit: ${String(value)}`)
    }
    return syncUnit
}

export function targetSupportsPackage(
    target: ApmSyncTargetId,
    pkg: ApmPackageSummary,
    syncUnit: ApmSyncUnit,
) {
    if (syncUnit !== 'agent-packages') {
        return targetSupportsSyncUnit(target, syncUnit)
    }
    const primitiveUnits = apmPackageSyncUnits(pkg)
    return primitiveUnits.length > 0
        && primitiveUnits.every((unit) => targetSupportsSyncUnit(target, unit))
}

function planPackageTargetJob(
    pkg: ApmPackageSummary,
    target: ApmSyncTargetId,
    syncUnit: ApmSyncUnit,
): PlannedApmSyncJob {
    if (!apmPackageHasSyncUnit(pkg, syncUnit)) {
        return {
            kind: 'skip',
            result: skippedResult(pkg, target, syncUnit, [
                `Package does not contain ${syncUnit === 'agent-packages' ? 'syncable primitives' : syncUnit}.`,
            ]),
        }
    }

    if (!targetSupportsPackage(target, pkg, syncUnit)) {
        return {
            kind: 'skip',
            result: skippedResult(pkg, target, syncUnit, [
                `${syncTargetProfile(target).label} does not support all selected sync units for this package.`,
            ]),
        }
    }

    return {
        kind: 'run',
        package: pkg,
        target,
        syncUnit,
    }
}

export async function planApmTargetSync(
    workingDir: string,
    request: ApmSyncRunRequest,
): Promise<ApmTargetSyncPlan> {
    const targets = normalizeSyncTargets(request.targets)
    const syncUnit = normalizeRequestedSyncUnit(request.syncUnit)
    const selected = new Set((request.packageIds || []).filter(Boolean))
    const packages = (await listApmPackages(workingDir))
        .filter((pkg) => selected.size === 0 || selected.has(pkg.packageId))
    const jobs = packages.flatMap((pkg) =>
        targets.map((target) => planPackageTargetJob(pkg, target, syncUnit)),
    )

    return {
        targets,
        syncUnit,
        jobs,
    }
}
