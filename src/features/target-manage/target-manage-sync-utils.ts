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
    APM_SYNC_UNITS,
} from '../../../shared/apm-sync-contracts'

export type TargetManageSidebarSection = 'packages' | 'primitives'
export type TargetManagePackageSyncState = 'synced' | 'unsynced' | 'blocked'
export type TargetSyncChoice = 'push' | 'skip'

export const PRIMITIVE_SYNC_UNITS: ApmPrimitiveSyncUnit[] = [
    'agents',
    'instructions',
    'skills',
    'prompts',
    'commands',
    'hooks',
    'mcp',
]

const PRIMITIVE_LABELS: Record<ApmPrimitiveSyncUnit, { one: string; many: string }> = {
    agents: { one: 'agent', many: 'agents' },
    instructions: { one: 'instruction', many: 'instructions' },
    skills: { one: 'skill', many: 'skills' },
    prompts: { one: 'prompt', many: 'prompts' },
    commands: { one: 'command', many: 'commands' },
    hooks: { one: 'hook', many: 'hooks' },
    mcp: { one: 'MCP', many: 'MCP' },
}

export function unitLabel(unit: ApmSyncUnit) {
    return APM_SYNC_UNITS.find((entry) => entry.id === unit)?.label || unit
}

export function sidebarSectionForUnit(unit: ApmSyncUnit): TargetManageSidebarSection {
    return unit === 'studio-agent' ? 'packages' : 'primitives'
}

export function primitiveUnitForSidebar(unit: ApmSyncUnit): ApmPrimitiveSyncUnit {
    return unit === 'studio-agent' ? 'agents' : unit
}

export function primitiveCountParts(
    counts: ApmSyncPrimitiveCounts,
    syncUnit: ApmSyncUnit = 'studio-agent',
) {
    const keys: ApmPrimitiveSyncUnit[] = syncUnit === 'studio-agent' ? PRIMITIVE_SYNC_UNITS : [syncUnit]
    return keys
        .map((key) => {
            const value = counts[key] || 0
            if (value <= 0) return null
            const labels = PRIMITIVE_LABELS[key]
            return `${value} ${value === 1 ? labels.one : labels.many}`
        })
        .filter(Boolean) as string[]
}

export function primitiveSummary(
    counts: ApmSyncPrimitiveCounts,
    syncUnit: ApmSyncUnit = 'studio-agent',
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
        `${counts.agents} agents ${counts.instructions} instructions ${counts.skills} skills ${counts.prompts} prompts ${counts.commands} commands ${counts.hooks} hooks ${counts.mcp} mcp`,
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
        case 'studio-agent':
            return 'packages/*'
        case 'agents':
            return 'packages/*/.apm/agents'
        case 'instructions':
            return 'packages/*/.apm/instructions'
        case 'skills':
            return 'packages/*/.apm/skills'
        case 'prompts':
            return 'packages/*/.apm/prompts'
        case 'commands':
            return 'packages/*/.apm/prompts/*.prompt.md'
        case 'hooks':
            return 'packages/*/.apm/hooks'
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
    if (syncUnit !== 'studio-agent') {
        const supported = target.supportedSyncUnits.includes(syncUnit)
        return {
            available: supported,
            reason: supported ? null : `${target.label} does not support ${unitLabel(syncUnit)}.`,
        }
    }

    const unsupportedPackage = selectedPackages.find((pkg) => !packageHasSyncUnit(pkg, syncUnit))
    return {
        available: target.supportedSyncUnits.includes(syncUnit) && !unsupportedPackage,
        reason: unsupportedPackage
            ? `${unsupportedPackage.agentName || unsupportedPackage.name} is not a Studio Agent package.`
            : target.supportedSyncUnits.includes(syncUnit)
                ? null
                : `${target.label} does not support ${unitLabel(syncUnit)} export.`,
    }
}

export function targetPackageAvailability(
    target: ApmSyncTargetSummary,
    syncUnit: ApmSyncUnit,
    pkg: ApmPackageSummary,
) {
    if (!packageHasSyncUnit(pkg, syncUnit)) {
        return {
            available: false,
            reason: `${pkg.agentName || pkg.name} does not contain ${unitLabel(syncUnit)}.`,
        }
    }
    return targetAvailability(target, syncUnit, [pkg])
}

export function findManagedDefinitionForPackage(
    definitions: ApmSyncTargetDefinitionSummary[],
    pkg: ApmPackageSummary,
) {
    return definitions.find((definition) => definition.managedPackageId === pkg.packageId) || null
}
