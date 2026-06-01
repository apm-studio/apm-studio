import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncPackageResult,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetItemSummary,
    ApmSyncTargetSummary,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts'
import {
    apmPackageSyncPrimitiveCounts,
} from '../../../shared/apm-sync-contracts'
import {
    primitiveCountParts,
    targetPackageAvailability,
    type TargetExportChoice,
    unitLabel,
} from './target-export-sync-utils'

export type TargetExportTargetStateClass = 'is-ready' | 'is-warning'

export interface TargetExportTargetPackageRowModel {
    availability: ReturnType<typeof targetPackageAvailability>
    badges: string[]
    detail: string
    packageId: string
    packageName: string
    stateClass: TargetExportTargetStateClass
    status: string
    exportChoice: TargetExportChoice
}

export interface TargetExportTargetOnlyDefinitionRowModel {
    badges: string[]
    detail: string
    id: string
    name: string
    stateClass: TargetExportTargetStateClass
    status: string
}

export function buildTargetExportTargetPackageRowModel(input: {
    currentItem?: ApmSyncTargetItemSummary
    definition?: ApmSyncTargetDefinitionSummary
    pkg: ApmPackageSummary
    result?: ApmSyncPackageResult
    exportChoice: TargetExportChoice
    syncUnit: ApmSyncUnit
    target: ApmSyncTargetSummary
}): TargetExportTargetPackageRowModel {
    const {
        currentItem,
        definition,
        pkg,
        result,
        exportChoice,
        syncUnit,
        target,
    } = input
    const counts = apmPackageSyncPrimitiveCounts(pkg)
    const parts = primitiveCountParts(counts)
    const availability = targetPackageAvailability(target, syncUnit, pkg)
    const status = result?.status || (exportChoice === 'skip' ? 'Skip' : availability.available ? 'Save' : 'Blocked')
    const stateClass = result?.status === 'failed' || result?.status === 'skipped' || !availability.available
        ? 'is-warning'
        : 'is-ready'
    const detail = result?.error
        || result?.artifacts?.[0]
        || result?.warnings?.[0]
        || definition?.path
        || currentItem?.artifacts[0]
        || availability.reason
        || target.outputHint
    const badges = [
        ...(parts.length > 0 ? parts : ['empty']),
        definition?.kind,
        definition?.managed ? 'Managed' : null,
        currentItem ? 'Current' : null,
        result?.projectedAs,
        currentItem ? `${currentItem.artifactCount} artifact${currentItem.artifactCount === 1 ? '' : 's'}` : null,
        result?.modelOmitted || pkg.agentComponents?.model ? 'model: Studio only' : null,
    ].filter((badge): badge is string => Boolean(badge))

    return {
        availability,
        badges,
        detail,
        packageId: pkg.packageId,
        packageName: pkg.agentName || pkg.name,
        stateClass,
        status,
        exportChoice,
    }
}

export function buildTargetExportTargetOnlyDefinitionRowModel(
    definition: ApmSyncTargetDefinitionSummary,
): TargetExportTargetOnlyDefinitionRowModel {
    return {
        badges: [
            'Target only',
            definition.kind,
            definition.syncUnit ? unitLabel(definition.syncUnit) : null,
            definition.managed ? 'Managed' : null,
        ].filter((badge): badge is string => Boolean(badge)),
        detail: definition.path,
        id: definition.id,
        name: definition.name,
        stateClass: 'is-ready',
        status: 'Keep',
    }
}
