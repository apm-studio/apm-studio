import type {
    ApmPackageReadResponse,
    ApmPackageScope,
    ApmPackageSummary,
    MicrosoftApmPrimitiveCounts,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncPackageResult,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetItemSummary,
    ApmSyncTargetSummary,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts'
import { apmPackageSyncPrimitiveCounts } from '../../../shared/apm-sync-contracts'
import type {
    AssetDetailList,
    AssetDetailModel,
    AssetDetailNotice,
    AssetDetailRow,
    AssetDetailSection,
} from '../../components/shared/asset-detail-types'
import type { TargetExportSourcePackageRowModel } from './target-export-source-row-model'
import type {
    TargetExportSourcePrimitiveItem,
    TargetExportSourcePrimitiveRowModel,
} from './target-export-source-row-model'
import type {
    TargetExportTargetOnlyDefinitionRowModel,
    TargetExportTargetPackageRowModel,
} from './target-export-target-row-model'
import {
    packageScopeLabel,
    targetOutputHint,
    type TargetExportChoice,
    type TargetExportPackageState,
    type TargetExportScopedPackage,
    unitLabel,
} from './target-export-sync-utils'

export type TargetExportLocalPackageReadState = {
    packageRead?: ApmPackageReadResponse | null
    packageLoading?: boolean
    packageError?: string | null
}

export type TargetExportSourcePackageDetailRequest = {
    kind: 'source-package'
    activeTargetLabel?: string
    copyStaged: boolean
    copyTargetScope: ApmPackageScope
    pkg: TargetExportScopedPackage
    row: TargetExportSourcePackageRowModel
    selectedSyncUnit: ApmSyncUnit
    targetStaged: boolean
    targetState?: TargetExportPackageState
}

export type TargetExportSourcePrimitiveDetailRequest = {
    kind: 'source-primitive'
    activeTargetLabel?: string
    copyStaged: boolean
    copyTargetScope: ApmPackageScope
    item: TargetExportSourcePrimitiveItem
    pkg: TargetExportScopedPackage
    row: TargetExportSourcePrimitiveRowModel
    selectedSyncUnit: ApmSyncUnit
    targetStaged: boolean
    targetState?: TargetExportPackageState
}

export type TargetExportTargetPackageDetailRequest = {
    kind: 'target-package'
    activeTarget: ApmSyncTargetSummary
    currentItem?: ApmSyncTargetItemSummary
    definition?: ApmSyncTargetDefinitionSummary
    exportChoice: TargetExportChoice
    pkg: TargetExportScopedPackage
    result?: ApmSyncPackageResult
    row: TargetExportTargetPackageRowModel
    selectedSyncUnit: ApmSyncUnit
}

export type TargetExportTargetOnlyDefinitionDetailRequest = {
    kind: 'target-only-definition'
    activeTarget: ApmSyncTargetSummary
    definition: ApmSyncTargetDefinitionSummary
    row: TargetExportTargetOnlyDefinitionRowModel
}

export type TargetExportAssetDetailRequest =
    | TargetExportSourcePackageDetailRequest
    | TargetExportSourcePrimitiveDetailRequest
    | TargetExportTargetPackageDetailRequest
    | TargetExportTargetOnlyDefinitionDetailRequest

const PRIMITIVE_LABELS: Array<{ key: keyof MicrosoftApmPrimitiveCounts; label: string }> = [
    { key: 'agents', label: 'Agents' },
    { key: 'instructions', label: 'Instructions' },
    { key: 'skills', label: 'Skills' },
    { key: 'prompts', label: 'Prompts' },
    { key: 'commands', label: 'Commands' },
    { key: 'hooks', label: 'Hooks' },
    { key: 'mcp', label: 'MCP' },
]

function compactRows(rows: Array<AssetDetailRow | null | undefined>) {
    return rows.filter((row): row is AssetDetailRow => Boolean(row && row.value.trim()))
}

function compactNotices(notices: Array<AssetDetailNotice | null | undefined>) {
    return notices.filter((notice): notice is AssetDetailNotice => Boolean(notice))
}

function compactLists(lists: Array<AssetDetailList | null | undefined>) {
    return lists.filter((list): list is AssetDetailList => Boolean(list))
}

function uniqueBadges(badges: Array<string | null | undefined>) {
    return Array.from(new Set(badges.filter((badge): badge is string => Boolean(badge))))
}

function primitiveCountBadges(pkg: ApmPackageSummary) {
    const counts = apmPackageSyncPrimitiveCounts(pkg)
    return PRIMITIVE_LABELS
        .map(({ key, label }) => {
            const value = counts[key]
            return value > 0 ? `${label}: ${value}` : null
        })
        .filter((value): value is string => Boolean(value))
}

function packagePath(pkg: ApmPackageSummary) {
    return pkg.microsoftApm?.packageRoot || pkg.manifestPath || 'package root unavailable'
}

function formatUpdatedAt(value: number | undefined) {
    return value ? new Date(value).toISOString() : ''
}

function readPackageSection(readState: TargetExportLocalPackageReadState = {}): AssetDetailSection {
    const { packageError, packageLoading, packageRead } = readState
    return {
        title: 'Read-only apm.yml',
        tab: 'content',
        rows: compactRows([
            packageRead ? { label: 'Package ID', value: packageRead.packageId, mono: true } : null,
            packageRead?.microsoftApm?.packageRoot ? { label: 'Package root', value: packageRead.microsoftApm.packageRoot, mono: true } : null,
        ]),
        lists: packageRead?.microsoftApm?.primitivePaths.length
            ? [{ label: 'Primitive paths', values: packageRead.microsoftApm.primitivePaths, mono: true }]
            : undefined,
        notices: compactNotices([
            packageLoading ? { text: 'Loading package manifest...', tone: 'muted' as const } : null,
            packageError ? { text: packageError, tone: 'danger' as const } : null,
            !packageLoading && !packageError && !packageRead ? { text: 'Package manifest has not been loaded.', tone: 'muted' as const } : null,
        ]),
        codeBlocks: packageRead?.manifestYaml
            ? [{ label: 'apm.yml', value: packageRead.manifestYaml }]
            : undefined,
    }
}

function packageFileSection(pkg: ApmPackageSummary): AssetDetailSection {
    const microsoftApm = pkg.microsoftApm
    return {
        title: 'APM Files',
        tab: 'metadata',
        rows: compactRows([
            microsoftApm?.sourceDir ? { label: 'Source dir', value: microsoftApm.sourceDir, mono: true } : null,
            microsoftApm?.installCommand ? { label: 'Install command', value: microsoftApm.installCommand, mono: true } : null,
            microsoftApm?.validateCommand ? { label: 'Validate command', value: microsoftApm.validateCommand, mono: true } : null,
            microsoftApm?.packCommand ? { label: 'Pack command', value: microsoftApm.packCommand, mono: true } : null,
        ]),
        lists: microsoftApm?.primitivePaths.length
            ? [{ label: 'Primitive paths', values: microsoftApm.primitivePaths, mono: true }]
            : undefined,
        notices: microsoftApm?.warnings.map((warning) => ({ text: warning, tone: 'warning' as const })),
    }
}

export function buildTargetExportSourcePackageDetailModel(
    request: TargetExportSourcePackageDetailRequest,
    readState: TargetExportLocalPackageReadState = {},
): AssetDetailModel {
    const { activeTargetLabel, copyStaged, copyTargetScope, pkg, row, selectedSyncUnit, targetStaged, targetState } = request
    const primitiveBadges = primitiveCountBadges(pkg)

    return {
        title: row.packageName,
        subtitle: `${packageScopeLabel(pkg.scope)} source package`,
        description: row.detail || pkg.description || 'No description available.',
        badges: uniqueBadges([
            row.status,
            pkg.kind,
            unitLabel(selectedSyncUnit),
            targetStaged ? `Staged for ${activeTargetLabel || 'target'}` : null,
            copyStaged ? `Copy to ${packageScopeLabel(copyTargetScope)}` : null,
        ]),
        sections: [
            {
                title: 'Source Package',
                tab: 'metadata',
                rows: compactRows([
                    { label: 'Package ID', value: pkg.packageId, mono: true },
                    { label: 'Scope', value: packageScopeLabel(pkg.scope) },
                    { label: 'Kind', value: pkg.kind },
                    { label: 'Selected unit', value: unitLabel(selectedSyncUnit) },
                    { label: 'Status', value: row.status },
                    targetState ? { label: 'Target state', value: targetState } : null,
                    { label: 'Package path', value: packagePath(pkg), mono: true },
                    pkg.manifestPath ? { label: 'Manifest path', value: pkg.manifestPath, mono: true } : null,
                    pkg.derivedFrom ? { label: 'Derived from', value: pkg.derivedFrom, mono: true } : null,
                    { label: 'Updated', value: formatUpdatedAt(pkg.updatedAt) },
                ]),
            },
            {
                title: 'Primitives',
                tab: 'other',
                badges: primitiveBadges.length > 0 ? primitiveBadges : ['No primitives to inject'],
            },
            packageFileSection(pkg),
            readPackageSection(readState),
        ],
    }
}

export function buildTargetExportSourcePrimitiveDetailModel(
    request: TargetExportSourcePrimitiveDetailRequest,
    readState: TargetExportLocalPackageReadState = {},
): AssetDetailModel {
    const { activeTargetLabel, copyStaged, copyTargetScope, item, pkg, row, selectedSyncUnit, targetStaged, targetState } = request
    const primitiveBadges = primitiveCountBadges(pkg)

    return {
        title: row.primitiveName,
        subtitle: `${unitLabel(selectedSyncUnit)} source primitive`,
        description: row.detail || pkg.description || 'No description available.',
        badges: uniqueBadges([
            row.status,
            unitLabel(selectedSyncUnit),
            targetStaged ? `Staged for ${activeTargetLabel || 'target'}` : null,
            copyStaged ? `Copy package to ${packageScopeLabel(copyTargetScope)}` : null,
        ]),
        sections: [
            {
                title: 'Source Primitive',
                tab: 'content',
                rows: compactRows([
                    { label: 'Name', value: row.primitiveName },
                    { label: 'Kind', value: unitLabel(selectedSyncUnit) },
                    row.primitivePath ? { label: 'Source path', value: row.primitivePath, mono: true } : null,
                    { label: 'Status', value: row.status },
                    targetState ? { label: 'Target state', value: targetState } : null,
                ]),
            },
            {
                title: 'Source Package',
                tab: 'metadata',
                rows: compactRows([
                    { label: 'Package', value: item.packageName },
                    { label: 'Package ID', value: pkg.packageId, mono: true },
                    { label: 'Scope', value: packageScopeLabel(pkg.scope) },
                    { label: 'Package kind', value: pkg.kind },
                    { label: 'Package path', value: packagePath(pkg), mono: true },
                    pkg.manifestPath ? { label: 'Manifest path', value: pkg.manifestPath, mono: true } : null,
                    pkg.derivedFrom ? { label: 'Derived from', value: pkg.derivedFrom, mono: true } : null,
                    { label: 'Updated', value: formatUpdatedAt(pkg.updatedAt) },
                ]),
                badges: primitiveBadges.length > 0 ? primitiveBadges : ['No primitives to inject'],
            },
            packageFileSection(pkg),
            readPackageSection(readState),
        ],
    }
}

export function buildTargetExportTargetPackageDetailModel(
    request: TargetExportTargetPackageDetailRequest,
    readState: TargetExportLocalPackageReadState = {},
): AssetDetailModel {
    const {
        activeTarget,
        currentItem,
        definition,
        exportChoice,
        pkg,
        result,
        row,
        selectedSyncUnit,
    } = request
    const primitiveBadges = primitiveCountBadges(pkg)
    const outputHint = targetOutputHint(activeTarget, selectedSyncUnit)
    const resultNotices = compactNotices([
        result?.error ? { text: result.error, tone: 'danger' as const } : null,
        ...(result?.warnings || []).map((warning) => ({ text: warning, tone: 'warning' as const })),
        result?.modelOmitted || pkg.agentComponents?.model
            ? { text: 'Studio-only model settings stay inside Studio and are not injected into target artifacts.', tone: 'muted' as const }
            : null,
    ])

    return {
        title: row.packageName,
        subtitle: `${activeTarget.label} target item`,
        description: row.detail,
        badges: uniqueBadges([
            row.status,
            exportChoice === 'save' ? 'Save' : 'Skip',
            unitLabel(selectedSyncUnit),
            ...row.badges,
        ]),
        sections: [
            {
                title: 'Inject Target',
                tab: 'metadata',
                rows: compactRows([
                    { label: 'Target', value: activeTarget.label },
                    { label: 'Target ID', value: activeTarget.id, mono: true },
                    { label: 'Output', value: outputHint, mono: true },
                    activeTarget.apmCliStatus ? { label: 'APM target status', value: activeTarget.apmCliStatus } : null,
                    activeTarget.apmCliSource ? { label: 'APM target source', value: activeTarget.apmCliSource, mono: true } : null,
                    activeTarget.apmCliDeployDir ? { label: 'APM deploy dir', value: activeTarget.apmCliDeployDir, mono: true } : null,
                    activeTarget.apmCliNeeds ? { label: 'APM activation hint', value: activeTarget.apmCliNeeds, mono: true } : null,
                    { label: 'Selected unit', value: unitLabel(selectedSyncUnit) },
                    { label: 'Action', value: exportChoice },
                    { label: 'Status', value: row.status },
                    row.availability.reason ? { label: 'Availability', value: row.availability.reason } : null,
                ]),
            },
            {
                title: 'Source Package',
                tab: 'metadata',
                rows: compactRows([
                    { label: 'Package ID', value: pkg.packageId, mono: true },
                    { label: 'Scope', value: packageScopeLabel(pkg.scope) },
                    { label: 'Kind', value: pkg.kind },
                    { label: 'Package path', value: packagePath(pkg), mono: true },
                    pkg.manifestPath ? { label: 'Manifest path', value: pkg.manifestPath, mono: true } : null,
                ]),
                badges: primitiveBadges.length > 0 ? primitiveBadges : ['No primitives to inject'],
            },
            {
                title: 'Target State',
                tab: 'other',
                rows: compactRows([
                    definition ? { label: 'Definition path', value: definition.path, mono: true } : null,
                    definition ? { label: 'Definition kind', value: definition.kind } : null,
                    definition ? { label: 'Managed', value: definition.managed ? 'Yes' : 'No' } : null,
                    definition?.updatedAt ? { label: 'Definition updated', value: definition.updatedAt } : null,
                    currentItem ? { label: 'Current artifacts', value: `${currentItem.artifactCount}` } : null,
                    currentItem?.updatedAt ? { label: 'Current updated', value: currentItem.updatedAt } : null,
                    result ? { label: 'Result status', value: result.status } : null,
                    result?.projectedAs ? { label: 'Projected as', value: result.projectedAs } : null,
                    result?.command ? { label: 'Command', value: result.command, mono: true } : null,
                ]),
                lists: compactLists([
                    currentItem?.artifacts.length ? { label: 'Current artifact paths', values: currentItem.artifacts, mono: true } : null,
                    result?.artifacts?.length ? { label: 'Result artifact paths', values: result.artifacts, mono: true } : null,
                ]),
                notices: resultNotices,
            },
            readPackageSection(readState),
        ],
    }
}

export function buildTargetExportTargetOnlyDefinitionDetailModel(
    request: TargetExportTargetOnlyDefinitionDetailRequest,
): AssetDetailModel {
    const { activeTarget, definition, row } = request
    return {
        title: row.name,
        subtitle: `${activeTarget.label} target-only item`,
        description: row.detail,
        badges: row.badges,
        sections: [
            {
                title: 'Target-only Content',
                tab: 'content',
                rows: compactRows([
                    { label: 'Name', value: row.name },
                    { label: 'Description', value: row.detail },
                ]),
            },
            {
                title: 'Target Definition',
                tab: 'metadata',
                rows: compactRows([
                    { label: 'Definition ID', value: definition.id, mono: true },
                    { label: 'Target', value: activeTarget.label },
                    { label: 'Target ID', value: definition.target, mono: true },
                    { label: 'Name', value: definition.name },
                    { label: 'Kind', value: definition.kind },
                    definition.syncUnit ? { label: 'Sync unit', value: unitLabel(definition.syncUnit) } : null,
                    { label: 'Managed', value: definition.managed ? 'Yes' : 'No' },
                    definition.managedPackageId ? { label: 'Managed package', value: definition.managedPackageId, mono: true } : null,
                    definition.managedSyncUnit ? { label: 'Managed unit', value: unitLabel(definition.managedSyncUnit) } : null,
                    { label: 'Path', value: definition.path, mono: true },
                    definition.updatedAt ? { label: 'Updated', value: definition.updatedAt } : null,
                ]),
            },
        ],
    }
}

export function buildTargetExportAssetDetailModel(
    request: TargetExportAssetDetailRequest,
    readState: TargetExportLocalPackageReadState = {},
): AssetDetailModel {
    if (request.kind === 'source-primitive') {
        return buildTargetExportSourcePrimitiveDetailModel(request, readState)
    }
    if (request.kind === 'source-package') {
        return buildTargetExportSourcePackageDetailModel(request, readState)
    }
    if (request.kind === 'target-package') {
        return buildTargetExportTargetPackageDetailModel(request, readState)
    }
    return buildTargetExportTargetOnlyDefinitionDetailModel(request)
}

export function targetExportDetailNeedsPackageRead(request: TargetExportAssetDetailRequest | null) {
    return request?.kind === 'source-package' || request?.kind === 'source-primitive' || request?.kind === 'target-package'
}
