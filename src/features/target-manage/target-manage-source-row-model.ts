import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type { ApmSyncUnit } from '../../../shared/apm-sync-contracts'
import type { DragPrimitive } from '../../lib/dnd-handlers'
import {
    apmPackageSyncPrimitiveCounts,
} from '../../../shared/apm-sync-contracts'
import {
    packageReadiness,
    primitiveCountParts,
    type TargetManagePackageSyncState,
} from './target-manage-sync-utils'

export type TargetManageSourceStateClass = 'is-ready' | 'is-warning' | 'is-unsynced' | 'is-blocked'

export interface TargetManageSourcePackageRowModel {
    badges: string[]
    detail?: string
    packageId: string
    packageName: string
    staged: boolean
    stateClass: TargetManageSourceStateClass
    status: string
}

export function buildTargetManageSourcePackageRowModel(input: {
    pkg: ApmPackageSummary
    staged: boolean
    syncUnit: ApmSyncUnit
    targetState?: TargetManagePackageSyncState
}): TargetManageSourcePackageRowModel {
    const {
        pkg,
        staged,
        syncUnit,
        targetState,
    } = input
    const counts = apmPackageSyncPrimitiveCounts(pkg)
    const parts = primitiveCountParts(counts)
    const readiness = packageReadiness(pkg, syncUnit)
    let status = readiness.label
    let stateClass: TargetManageSourceStateClass = readiness.label === 'Ready' ? 'is-ready' : 'is-warning'
    if (targetState === 'blocked') {
        status = 'Blocked'
        stateClass = 'is-blocked'
    } else if (staged) {
        status = 'Staged'
        stateClass = 'is-ready'
    } else if (targetState === 'synced') {
        status = 'Synced'
        stateClass = 'is-ready'
    } else if (targetState === 'unsynced') {
        status = 'Unsynced'
        stateClass = 'is-unsynced'
    }
    const badges = [
        ...(parts.length > 0 ? parts : ['empty']),
        pkg.agentComponents?.model ? 'model: Studio only' : null,
    ].filter((badge): badge is string => Boolean(badge))

    return {
        badges,
        detail: pkg.description || pkg.manifestPath || readiness.title,
        packageId: pkg.packageId,
        packageName: pkg.agentName || pkg.name,
        staged,
        stateClass,
        status,
    }
}

export function buildTargetManagePackageDragPayload(
    pkg: ApmPackageSummary,
    syncUnit: ApmSyncUnit,
): DragPrimitive {
    const title = pkg.agentName || pkg.name || pkg.packageId
    return {
        kind: 'apm-package',
        urn: `apm-package/workspace/${pkg.packageId}`,
        packageId: pkg.packageId,
        packageKind: pkg.kind,
        scope: 'workspace',
        source: 'workspace',
        name: title,
        label: title,
        description: pkg.description || '',
        agentName: pkg.agentName,
        manifestPath: pkg.manifestPath,
        packageRoot: pkg.microsoftApm?.packageRoot,
        primitiveCounts: apmPackageSyncPrimitiveCounts(pkg),
        syncUnit,
    }
}
