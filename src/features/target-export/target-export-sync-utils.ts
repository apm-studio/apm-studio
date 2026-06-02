import type {
    ApmPackageScope,
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
    APM_SYNC_UNITS,
} from '../../../shared/apm-sync-contracts'

export type TargetExportSidebarSection = 'packages' | 'primitives'
export type TargetExportPackageState = 'synced' | 'unsynced' | 'blocked'
export type TargetExportChoice = 'save' | 'skip'
export type TargetExportScopedPackage = ApmPackageSummary & { scope: ApmPackageScope }

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

export function sidebarSectionForUnit(): TargetExportSidebarSection {
    return 'primitives'
}

export function primitiveUnitForSidebar(unit: ApmSyncUnit): ApmPrimitiveSyncUnit {
    return unit
}

export function primitiveCountParts(
    counts: ApmSyncPrimitiveCounts,
    syncUnit: ApmSyncUnit = 'agents',
) {
    const keys: ApmPrimitiveSyncUnit[] = [syncUnit]
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
    syncUnit: ApmSyncUnit = 'agents',
) {
    return primitiveCountParts(counts, syncUnit).join(', ') || `No ${unitLabel(syncUnit)}`
}

export function packageScopeLabel(scope: ApmPackageScope) {
    return scope === 'user' ? 'User' : 'Workspace'
}

export function scopeTargetExportPackages(
    packages: ApmPackageSummary[],
    scope: ApmPackageScope,
): TargetExportScopedPackage[] {
    return packages.map((pkg) => ({ ...pkg, scope }))
}

export function packageHasSyncUnit(pkg: ApmPackageSummary, syncUnit: ApmSyncUnit) {
    return apmPackageHasSyncUnit(pkg, syncUnit)
}

export function unitSourcePath(syncUnit: ApmSyncUnit) {
    switch (syncUnit) {
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
        : { label: 'Ready', title: `${unitLabel(syncUnit)} can be injected from this package.` }
}

export function targetAvailability(
    target: ApmSyncTargetSummary,
    syncUnit: ApmSyncUnit,
) {
    if (!target.available) {
        return { available: false, reason: target.disabledReason || 'Target unavailable.' }
    }
    const supported = target.supportedSyncUnits.includes(syncUnit)
    return {
        available: supported,
        reason: supported ? null : `${target.label} does not support ${unitLabel(syncUnit)}.`,
    }
}

export function targetOutputHint(target: ApmSyncTargetSummary, syncUnit: ApmSyncUnit) {
    return target.outputHints?.[syncUnit] || target.outputHint
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
    return targetAvailability(target, syncUnit)
}

export function findManagedDefinitionForPackage(
    definitions: ApmSyncTargetDefinitionSummary[],
    pkg: ApmPackageSummary,
) {
    return definitions.find((definition) => definition.managedPackageId === pkg.packageId) || null
}
