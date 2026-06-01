import type {
    ApmPackageScope,
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
    type TargetExportPackageState,
} from './target-export-sync-utils'

export type TargetExportSourceStateClass = 'is-ready' | 'is-warning' | 'is-unsynced' | 'is-blocked'

export interface TargetExportSourcePackageRowModel {
    badges: string[]
    detail?: string
    packageId: string
    packageName: string
    staged: boolean
    stateClass: TargetExportSourceStateClass
    status: string
}

export function buildTargetExportSourcePackageRowModel(input: {
    pkg: ApmPackageSummary
    staged: boolean
    syncUnit: ApmSyncUnit
    targetState?: TargetExportPackageState
}): TargetExportSourcePackageRowModel {
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
    let stateClass: TargetExportSourceStateClass = readiness.label === 'Ready' ? 'is-ready' : 'is-warning'
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

export function buildTargetExportPackageDragPayload(
    pkg: ApmPackageSummary & { scope?: ApmPackageScope },
    syncUnit: ApmSyncUnit,
): DragPrimitive {
    const title = pkg.agentName || pkg.name || pkg.packageId
    const scope = pkg.scope || 'workspace'
    return {
        kind: 'apm-package',
        urn: `apm-package/${scope}/${pkg.packageId}`,
        packageId: pkg.packageId,
        packageKind: pkg.kind,
        scope,
        source: scope,
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
