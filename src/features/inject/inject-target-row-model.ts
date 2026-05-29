import type {
    ApmPackageSummary,
    ApmSyncPackageResult,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetItemSummary,
    ApmSyncTargetSummary,
    ApmSyncUnit,
} from '../../../shared/apm-contracts'
import {
    apmPackageSyncPrimitiveCounts,
} from '../../../shared/apm-contracts'
import {
    primitiveCountParts,
    targetPackageAvailability,
    type TargetSyncChoice,
    unitLabel,
} from './inject-sync-utils'

export type InjectTargetStateClass = 'is-ready' | 'is-warning'

export interface InjectTargetPackageRowModel {
    availability: ReturnType<typeof targetPackageAvailability>
    badges: string[]
    detail: string
    packageId: string
    packageName: string
    stateClass: InjectTargetStateClass
    status: string
    syncChoice: TargetSyncChoice
}

export interface InjectTargetOnlyDefinitionRowModel {
    badges: string[]
    detail: string
    id: string
    name: string
    stateClass: InjectTargetStateClass
    status: string
}

export function buildInjectTargetPackageRowModel(input: {
    currentItem?: ApmSyncTargetItemSummary
    definition?: ApmSyncTargetDefinitionSummary
    pkg: ApmPackageSummary
    result?: ApmSyncPackageResult
    syncChoice: TargetSyncChoice
    syncUnit: ApmSyncUnit
    target: ApmSyncTargetSummary
}): InjectTargetPackageRowModel {
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
    const status = result?.status || (definition ? 'Matched' : currentItem ? 'Current' : availability.available ? 'New' : 'Blocked')
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
        definition?.managed ? 'managed' : null,
        result?.projectedAs,
        currentItem ? `${currentItem.artifactCount} current` : null,
        result?.modelOmitted || pkg.agentComponents?.model ? 'model: Run only' : null,
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

export function buildInjectTargetOnlyDefinitionRowModel(
    definition: ApmSyncTargetDefinitionSummary,
): InjectTargetOnlyDefinitionRowModel {
    return {
        badges: [
            definition.kind,
            definition.syncUnit ? unitLabel(definition.syncUnit) : null,
            definition.managed ? 'managed' : null,
        ].filter((badge): badge is string => Boolean(badge)),
        detail: definition.path,
        id: definition.id,
        name: definition.name,
        stateClass: 'is-ready',
        status: 'Keep',
    }
}
