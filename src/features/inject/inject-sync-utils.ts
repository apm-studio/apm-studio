import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type {
    ApmPrimitiveSyncUnit,
    ApmSyncPrimitiveCounts,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetSummary,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts'
import {
    apmPackageHasSyncUnit,
    apmPackageSyncPrimitiveCounts,
    apmPackageSyncUnits,
    APM_SYNC_UNITS,
} from '../../../shared/apm-sync-contracts'

export type InjectSidebarSection = 'packages' | 'primitives'
export type TargetSyncChoice = 'push' | 'skip'

export const PRIMITIVE_SYNC_UNITS: ApmPrimitiveSyncUnit[] = ['agents', 'instructions', 'skills', 'mcp']

const PRIMITIVE_LABELS: Record<ApmPrimitiveSyncUnit, { one: string; many: string }> = {
    agents: { one: 'agent', many: 'agents' },
    instructions: { one: 'instruction', many: 'instructions' },
    skills: { one: 'skill', many: 'skills' },
    mcp: { one: 'MCP', many: 'MCP' },
}

export function unitLabel(unit: ApmSyncUnit) {
    return APM_SYNC_UNITS.find((entry) => entry.id === unit)?.label || unit
}

export function sidebarSectionForUnit(unit: ApmSyncUnit): InjectSidebarSection {
    return unit === 'agent-packages' ? 'packages' : 'primitives'
}

export function primitiveUnitForSidebar(unit: ApmSyncUnit): ApmPrimitiveSyncUnit {
    return unit === 'agent-packages' ? 'agents' : unit
}

export function primitiveCountParts(
    counts: ApmSyncPrimitiveCounts,
    syncUnit: ApmSyncUnit = 'agent-packages',
) {
    const keys = syncUnit === 'agent-packages' ? PRIMITIVE_SYNC_UNITS : [syncUnit]
    return keys
        .map((key) => {
            const value = counts[key]
            if (value <= 0) return null
            const labels = PRIMITIVE_LABELS[key]
            return `${value} ${value === 1 ? labels.one : labels.many}`
        })
        .filter(Boolean) as string[]
}

export function primitiveSummary(
    counts: ApmSyncPrimitiveCounts,
    syncUnit: ApmSyncUnit = 'agent-packages',
) {
    return primitiveCountParts(counts, syncUnit).join(', ') || `No ${unitLabel(syncUnit)}`
}

export function packageSearchHaystack(pkg: ApmPackageSummary) {
    const counts = apmPackageSyncPrimitiveCounts(pkg)
    return [
        pkg.name,
        pkg.packageId,
        pkg.description,
        pkg.kind,
        pkg.agentName,
        pkg.derivedFrom,
        pkg.manifestPath,
        pkg.microsoftApm?.packageRoot,
        `${counts.agents} agents ${counts.instructions} instructions ${counts.skills} skills ${counts.mcp} mcp`,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function packageHasSyncUnit(pkg: ApmPackageSummary, syncUnit: ApmSyncUnit) {
    return apmPackageHasSyncUnit(pkg, syncUnit)
}

export function unitSourcePath(syncUnit: ApmSyncUnit) {
    switch (syncUnit) {
        case 'agent-packages':
            return 'packages/*'
        case 'agents':
            return 'packages/*/.apm/agents'
        case 'instructions':
            return 'packages/*/.apm/instructions'
        case 'skills':
            return 'packages/*/.apm/skills'
        case 'mcp':
            return 'apm.yml dependencies.mcp'
        default:
            return 'packages/*'
    }
}

export function packageReadiness(pkg: ApmPackageSummary, syncUnit: ApmSyncUnit) {
    if (!apmPackageHasSyncUnit(pkg, syncUnit)) {
        return { label: 'No unit', title: `Package does not contain ${unitLabel(syncUnit)}.` }
    }
    const warnings = pkg.microsoftApm?.warnings || []
    return warnings.length > 0
        ? { label: 'Check', title: warnings.join('\n') }
        : { label: 'Ready', title: `${unitLabel(syncUnit)} can be synced from this package.` }
}

export function targetAvailability(
    target: ApmSyncTargetSummary,
    syncUnit: ApmSyncUnit,
    selectedPackages: ApmPackageSummary[],
) {
    if (!target.available) {
        return { available: false, reason: target.disabledReason || 'Target unavailable.' }
    }
    if (syncUnit !== 'agent-packages') {
        const supported = target.supportedSyncUnits.includes(syncUnit)
        return {
            available: supported,
            reason: supported ? null : `${target.label} does not support ${unitLabel(syncUnit)}.`,
        }
    }

    const unsupportedPackage = selectedPackages.find((pkg) => {
        const units = apmPackageSyncUnits(pkg)
        return units.length === 0 || units.some((unit) => !target.supportedSyncUnits.includes(unit))
    })
    return {
        available: !unsupportedPackage,
        reason: unsupportedPackage
            ? `${target.label} cannot receive every primitive in ${unsupportedPackage.agentName || unsupportedPackage.name}.`
            : null,
    }
}

export function targetPackageAvailability(
    target: ApmSyncTargetSummary,
    syncUnit: ApmSyncUnit,
    pkg: ApmPackageSummary,
) {
    return targetAvailability(target, syncUnit, [pkg])
}

export function findManagedDefinitionForPackage(
    definitions: ApmSyncTargetDefinitionSummary[],
    pkg: ApmPackageSummary,
) {
    return definitions.find((definition) => definition.managedPackageId === pkg.packageId) || null
}
