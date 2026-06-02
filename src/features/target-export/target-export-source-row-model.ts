import type {
    ApmPackageScope,
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type { ApmPrimitiveSyncUnit, ApmSyncUnit } from '../../../shared/apm-sync-contracts'
import type { DragPrimitive } from '../../lib/dnd-handlers'
import {
    apmPackageSyncPrimitiveCounts,
} from '../../../shared/apm-sync-contracts'
import {
    packageReadiness,
    primitiveCountParts,
    unitLabel,
    type TargetExportPackageState,
    type TargetExportScopedPackage,
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

export interface TargetExportSourcePrimitiveItem {
    id: string
    packageId: string
    packageKind: string
    packageName: string
    primitiveName: string
    primitivePath?: string
    primitiveIndex: number
    pkg: TargetExportScopedPackage
    scope: ApmPackageScope
    syncUnit: ApmPrimitiveSyncUnit
}

export interface TargetExportSourcePrimitiveRowModel {
    badges: string[]
    detail?: string
    itemId: string
    packageId: string
    packageName: string
    primitiveName: string
    primitivePath?: string
    staged: boolean
    stateClass: TargetExportSourceStateClass
    status: string
}

const SINGULAR_UNIT_LABELS: Record<ApmPrimitiveSyncUnit, string> = {
    agents: 'Agent',
    instructions: 'Instruction',
    skills: 'Skill',
    prompts: 'Prompt',
    commands: 'Command',
    hooks: 'Hook',
    mcp: 'MCP',
}

function normalizedPrimitivePath(value: string) {
    const normalized = value.replace(/\\/g, '/')
    const sourceIndex = normalized.indexOf('.apm/')
    return sourceIndex >= 0 ? normalized.slice(sourceIndex) : normalized.replace(/^\/+/, '')
}

function stripKnownSuffix(name: string, syncUnit: ApmPrimitiveSyncUnit) {
    if (syncUnit === 'agents') return name.replace(/\.agent\.md$/i, '')
    if (syncUnit === 'instructions') return name.replace(/\.instructions\.md$/i, '').replace(/\.md$/i, '')
    if (syncUnit === 'prompts' || syncUnit === 'commands') return name.replace(/\.prompt\.md$/i, '')
    if (syncUnit === 'hooks') return name.replace(/\.json$/i, '')
    return name
}

function pathBasename(value: string) {
    const parts = value.split('/').filter(Boolean)
    return parts[parts.length - 1] || value
}

function primitiveNameFromPath(pathValue: string, syncUnit: ApmPrimitiveSyncUnit) {
    const normalized = normalizedPrimitivePath(pathValue)
    if (syncUnit === 'skills') {
        const parts = normalized.split('/').filter(Boolean)
        const skillDir = parts[parts.length - 2]
        return skillDir || 'Skill'
    }
    return stripKnownSuffix(pathBasename(normalized), syncUnit) || SINGULAR_UNIT_LABELS[syncUnit]
}

function primitivePathMatchesUnit(pathValue: string, syncUnit: ApmPrimitiveSyncUnit) {
    const normalized = normalizedPrimitivePath(pathValue)
    switch (syncUnit) {
        case 'agents':
            return normalized.startsWith('.apm/agents/') && normalized.endsWith('.agent.md')
        case 'instructions':
            return normalized.startsWith('.apm/instructions/') && (normalized.endsWith('.instructions.md') || normalized.endsWith('.md'))
        case 'skills':
            return normalized.startsWith('.apm/skills/') && normalized.endsWith('/SKILL.md')
        case 'prompts':
        case 'commands':
            return normalized.startsWith('.apm/prompts/') && normalized.endsWith('.prompt.md')
        case 'hooks':
            return normalized.startsWith('.apm/hooks/') && normalized.endsWith('.json')
        case 'mcp':
            return false
        default:
            return false
    }
}

function primitiveFallbackName(pkg: TargetExportScopedPackage, syncUnit: ApmPrimitiveSyncUnit, index: number, total: number) {
    if (syncUnit === 'agents' && total === 1) return pkg.agentName || pkg.name
    if (syncUnit === 'mcp') return total === 1 ? 'MCP dependency' : `MCP dependency ${index + 1}`
    const label = SINGULAR_UNIT_LABELS[syncUnit]
    return total === 1 ? label : `${label} ${index + 1}`
}

function packageDisplayName(pkg: ApmPackageSummary) {
    return pkg.agentName || pkg.name
}

export function buildTargetExportSourcePrimitiveItems(
    packages: TargetExportScopedPackage[],
    syncUnit: ApmPrimitiveSyncUnit,
): TargetExportSourcePrimitiveItem[] {
    return packages.flatMap((pkg) => {
        const counts = apmPackageSyncPrimitiveCounts(pkg)
        const expectedCount = counts[syncUnit] || 0
        if (expectedCount <= 0) return []

        const paths = (pkg.microsoftApm?.primitivePaths || [])
            .map(normalizedPrimitivePath)
            .filter((pathValue) => primitivePathMatchesUnit(pathValue, syncUnit))
        const itemCount = Math.max(paths.length, expectedCount)
        return Array.from({ length: itemCount }, (_, index): TargetExportSourcePrimitiveItem => {
            const primitivePath = paths[index] || (syncUnit === 'mcp' ? `apm.yml dependencies.mcp[${index}]` : undefined)
            const primitiveName = syncUnit === 'mcp'
                ? primitiveFallbackName(pkg, syncUnit, index, itemCount)
                : primitivePath
                    ? primitiveNameFromPath(primitivePath, syncUnit)
                    : primitiveFallbackName(pkg, syncUnit, index, itemCount)
            return {
                id: `${pkg.scope}:${pkg.packageId}:${syncUnit}:${primitivePath || index}`,
                packageId: pkg.packageId,
                packageKind: pkg.kind,
                packageName: packageDisplayName(pkg),
                primitiveName,
                primitivePath,
                primitiveIndex: index,
                pkg,
                scope: pkg.scope,
                syncUnit,
            }
        })
    })
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
    const parts = primitiveCountParts(counts, syncUnit)
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

export function buildTargetExportSourcePrimitiveRowModel(input: {
    item: TargetExportSourcePrimitiveItem
    staged: boolean
    targetState?: TargetExportPackageState
}): TargetExportSourcePrimitiveRowModel {
    const {
        item,
        staged,
        targetState,
    } = input
    const readiness = packageReadiness(item.pkg, item.syncUnit)
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
        SINGULAR_UNIT_LABELS[item.syncUnit],
        `from ${item.packageName}`,
        item.syncUnit === 'agents' && item.pkg.agentComponents?.model ? 'model: Studio only' : null,
    ].filter((badge): badge is string => Boolean(badge))

    return {
        badges,
        detail: item.primitivePath || `${unitLabel(item.syncUnit)} from ${item.packageName}`,
        itemId: item.id,
        packageId: item.packageId,
        packageName: item.packageName,
        primitiveName: item.primitiveName,
        primitivePath: item.primitivePath,
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

export function buildTargetExportPrimitiveDragPayload(
    item: TargetExportSourcePrimitiveItem,
): DragPrimitive {
    return {
        ...buildTargetExportPackageDragPayload(item.pkg, item.syncUnit),
        urn: `apm-primitive/${item.scope}/${item.packageId}/${item.syncUnit}/${encodeURIComponent(item.primitivePath || String(item.primitiveIndex))}`,
        name: item.primitiveName,
        label: item.primitiveName,
        description: item.primitivePath || `${unitLabel(item.syncUnit)} from ${item.packageName}`,
    }
}
