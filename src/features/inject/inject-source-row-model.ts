import type {
    ApmPackageSummary,
    ApmSyncUnit,
} from '../../../shared/apm-contracts'
import {
    apmPackageSyncPrimitiveCounts,
} from '../../../shared/apm-contracts'
import {
    packageReadiness,
    primitiveCountParts,
} from './inject-sync-utils'

export type InjectSourceStateClass = 'is-ready' | 'is-warning'

export interface InjectSourcePackageRowModel {
    badges: string[]
    detail?: string
    packageId: string
    packageName: string
    selected: boolean
    stateClass: InjectSourceStateClass
    status: string
}

export function buildInjectSourcePackageRowModel(input: {
    pkg: ApmPackageSummary
    selected: boolean
    syncUnit: ApmSyncUnit
}): InjectSourcePackageRowModel {
    const {
        pkg,
        selected,
        syncUnit,
    } = input
    const counts = apmPackageSyncPrimitiveCounts(pkg)
    const parts = primitiveCountParts(counts)
    const readiness = packageReadiness(pkg, syncUnit)
    const status = selected ? 'Selected' : readiness.label
    const stateClass = selected || readiness.label === 'Ready' ? 'is-ready' : 'is-warning'
    const badges = [
        ...(parts.length > 0 ? parts : ['empty']),
        pkg.agentComponents?.model ? 'model: Run only' : null,
    ].filter((badge): badge is string => Boolean(badge))

    return {
        badges,
        detail: pkg.description || pkg.manifestPath || readiness.title,
        packageId: pkg.packageId,
        packageName: pkg.agentName || pkg.name,
        selected,
        stateClass,
        status,
    }
}
