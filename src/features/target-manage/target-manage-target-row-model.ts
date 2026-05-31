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
    type TargetSyncChoice,
    unitLabel,
} from './target-manage-sync-utils'

export type TargetManageTargetStateClass = 'is-ready' | 'is-warning'

export interface TargetManageTargetPackageRowModel {
    availability: ReturnType<typeof targetPackageAvailability>
    badges: string[]
    detail: string
    packageId: string
    packageName: string
    stateClass: TargetManageTargetStateClass
    status: string
    syncChoice: TargetSyncChoice
}

export interface TargetManageTargetOnlyDefinitionRowModel {
    badges: string[]
    detail: string
    id: string
    name: string
    stateClass: TargetManageTargetStateClass
    status: string
}

export function buildTargetManageTargetPackageRowModel(input: {
    currentItem?: ApmSyncTargetItemSummary
    definition?: ApmSyncTargetDefinitionSummary
    pkg: ApmPackageSummary
    result?: ApmSyncPackageResult
    syncChoice: TargetSyncChoice
    syncUnit: ApmSyncUnit
    target: ApmSyncTargetSummary
}): TargetManageTargetPackageRowModel {
    const {
        currentItem,
        definition,
        pkg,
        result,
        syncChoice,
        syncUnit,
        target,
    } = input
    const counts = apmPackageSyncPrimitiveCounts(pkg)
    const parts = primitiveCountParts(counts)
    const availability = targetPackageAvailability(target, syncUnit, pkg)
    const status = result?.status || (syncChoice === 'skip' ? 'Skip' : availability.available ? 'Push' : 'Blocked')
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
        syncChoice,
    }
}

export function buildTargetManageTargetOnlyDefinitionRowModel(
    definition: ApmSyncTargetDefinitionSummary,
): TargetManageTargetOnlyDefinitionRowModel {
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
