import type {
    ApmPackageScope,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncRunResponse,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetId,
    ApmSyncTargetSummary,
    ApmSyncTargetsResponse,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts'
import {
    sumApmPackageSyncPrimitiveCounts,
} from '../../../shared/apm-sync-contracts'
import {
    packageHasSyncUnit,
    primitiveSummary,
    primitiveUnitForSidebar,
    sidebarSectionForUnit,
    targetAvailability,
    targetOutputHint,
    targetPackageAvailability,
    type TargetExportScopedPackage,
    type TargetExportPackageState,
    type TargetExportChoice,
    unitLabel,
} from './target-export-sync-utils'

const EMPTY_TARGETS: ApmSyncTargetSummary[] = []

export interface TargetExportControllerModelInput {
    projectPackages: TargetExportScopedPackage[]
    userPackages: TargetExportScopedPackage[]
    targetsResponse: ApmSyncTargetsResponse | null
    selectedSyncUnit: ApmSyncUnit
    selectedTargets: ApmSyncTargetId[]
    stagedPackageIds: string[]
    stagedScopeCopies: TargetExportScopeCopy[]
    exportChoices: Record<string, TargetExportChoice>
    loadingTargets: boolean
    running: boolean
    lastResult: ApmSyncRunResponse | null
}

export interface TargetExportScopeCopy {
    packageId: string
    fromScope: ApmPackageScope
    toScope: ApmPackageScope
}

function sameOrderedValues(left: string[], right: string[]) {
    return left.length === right.length
        && left.every((value, index) => value === right[index])
}

export function normalizeTargetExportStagedPackages(
    current: string[],
    syncablePackageIds: string[],
) {
    if (syncablePackageIds.length === 0) {
        return current.length === 0 ? current : []
    }

    const valid = current.filter((packageId) => syncablePackageIds.includes(packageId))
    if (sameOrderedValues(valid, current)) {
        return current
    }
    return valid
}

export function normalizeTargetExportTargetSelection(
    current: ApmSyncTargetId[],
    availableTargetIds: ApmSyncTargetId[],
) {
    const available = new Set(availableTargetIds)
    const currentActive = current.find((id) => available.has(id))
    if (currentActive) {
        return current.length === 1 && current[0] === currentActive ? current : [currentActive]
    }
    const next = availableTargetIds[0] ? [availableTargetIds[0]] : []
    return sameOrderedValues(next, current) ? current : next
}

export function targetExportScopeCopyKey(copy: TargetExportScopeCopy) {
    return `${copy.fromScope}:${copy.toScope}:${copy.packageId}`
}

export function normalizeTargetExportStagedScopeCopies(
    current: TargetExportScopeCopy[],
    sourcePackageIdsByScope: Record<ApmPackageScope, string[]>,
) {
    const availableByScope: Record<ApmPackageScope, Set<string>> = {
        workspace: new Set(sourcePackageIdsByScope.workspace),
        user: new Set(sourcePackageIdsByScope.user),
    }
    const seen = new Set<string>()
    const valid = current.filter((copy) => {
        if (copy.fromScope === copy.toScope) return false
        if (!availableByScope[copy.fromScope].has(copy.packageId)) return false
        const key = targetExportScopeCopyKey(copy)
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
    if (
        valid.length === current.length
        && valid.every((copy, index) => targetExportScopeCopyKey(copy) === targetExportScopeCopyKey(current[index]))
    ) {
        return current
    }
    return valid
}

export function buildTargetExportControllerModel(input: TargetExportControllerModelInput) {
    const {
        lastResult,
        loadingTargets,
        projectPackages,
        running,
        stagedScopeCopies,
        stagedPackageIds,
        selectedSyncUnit,
        selectedTargets,
        exportChoices,
        targetsResponse,
        userPackages,
    } = input

    const targets = targetsResponse?.targets || EMPTY_TARGETS
    const selectedTargetSet = new Set(selectedTargets)
    const stagedPackageSet = new Set(stagedPackageIds)
    const stagedScopeCopySet = new Set(stagedScopeCopies.map(targetExportScopeCopyKey))
    const projectCounts = sumApmPackageSyncPrimitiveCounts(projectPackages)
    const userCounts = sumApmPackageSyncPrimitiveCounts(userPackages)
    const sidebarSection = sidebarSectionForUnit()
    const primitiveUnit = primitiveUnitForSidebar(selectedSyncUnit)
    const projectSyncablePackages = projectPackages.filter((pkg) => packageHasSyncUnit(pkg, selectedSyncUnit))
    const userSyncablePackages = userPackages.filter((pkg) => packageHasSyncUnit(pkg, selectedSyncUnit))
    const syncablePackageIds = projectSyncablePackages.map((pkg) => pkg.packageId)
    const stagedPackages = projectSyncablePackages.filter((pkg) => stagedPackageSet.has(pkg.packageId))
    const stagedCounts = sumApmPackageSyncPrimitiveCounts(stagedPackages)
    const stagedPrimitiveSummary = primitiveSummary(stagedCounts, selectedSyncUnit)
    const targetStates = new Map(targets.map((target) => [
        target.id,
        targetAvailability(target, selectedSyncUnit),
    ]))
    const availableTargetIds = targets
        .filter((target) => targetStates.get(target.id)?.available)
        .map((target) => target.id)
    const selectableTargetIds = targets
        .filter((target) => target.available)
        .map((target) => target.id)
    const activeTargets = targets.filter((target) => selectedTargetSet.has(target.id))
    const activeTarget = activeTargets[0] || targets.find((target) => targetStates.get(target.id)?.available) || targets[0] || null
    const activeTargetAvailability = activeTarget
        ? targetStates.get(activeTarget.id) || { available: false, reason: 'Target unavailable.' }
        : null
    const targetsReady = activeTargets.length > 0
        && activeTargets.every((target) => targetStates.get(target.id)?.available)
    const projectPackageWarnings = projectSyncablePackages.reduce((total, pkg) => total + (pkg.microsoftApm?.warnings.length || 0), 0)
    const userPackageWarnings = userSyncablePackages.reduce((total, pkg) => total + (pkg.microsoftApm?.warnings.length || 0), 0)
    const modelOmitted = stagedPackages.some((pkg) => pkg.agentComponents?.model)
    const toolingCommand = targetsResponse?.tooling.recommendedCommand
    const toolingStatusLabel = loadingTargets || !targetsResponse
        ? 'Checking'
        : toolingCommand
            ? 'CLI first'
            : 'Studio fallback'
    const resultRowsByTarget = new Map<ApmSyncTargetId, ApmSyncRunResponse['results']>()
    if (lastResult && lastResult.syncUnit === selectedSyncUnit) {
        for (const row of lastResult.results) {
            const current = resultRowsByTarget.get(row.target) || []
            current.push(row)
            resultRowsByTarget.set(row.target, current)
        }
    }
    const activeTargetResultRows = activeTarget ? resultRowsByTarget.get(activeTarget.id) || [] : []
    const activeTargetResultByPackage = new Map(activeTargetResultRows.map((row) => [row.packageId, row]))
    const currentItems = activeTarget?.currentItems || []
    const matchingCurrentItems = currentItems.filter((item) => (
        item.syncUnit === selectedSyncUnit
    ))
    const activeTargetCurrentByPackage = new Map(matchingCurrentItems.map((item) => [item.packageId, item]))
    const definitions = activeTarget?.definitions || []
    const activeTargetDefinitions = definitions.filter((definition) =>
        !definition.syncUnit || definition.syncUnit === selectedSyncUnit,
    )
    const projectSyncablePackageIds = new Set(projectSyncablePackages.map((pkg) => pkg.packageId))
    const activeTargetManagedDefinitionByPackage = new Map<string, ApmSyncTargetDefinitionSummary>()
    const matchedDefinitionIds = new Set<string>()
    for (const definition of activeTargetDefinitions) {
        const managedPackageId = definition.managedPackageId
        if (!managedPackageId || !projectSyncablePackageIds.has(managedPackageId)) continue
        matchedDefinitionIds.add(definition.id)
        if (!activeTargetManagedDefinitionByPackage.has(managedPackageId)) {
            activeTargetManagedDefinitionByPackage.set(managedPackageId, definition)
        }
    }
    const activeTargetDefinitionByPackage = new Map(activeTargetManagedDefinitionByPackage)
    const activeTargetCurrentPackages = projectSyncablePackages.filter((pkg) => (
        !stagedPackageSet.has(pkg.packageId)
        && (
            activeTargetCurrentByPackage.has(pkg.packageId)
            || activeTargetManagedDefinitionByPackage.has(pkg.packageId)
        )
    ))
    const targetOnlyDefinitions = activeTargetDefinitions.filter((definition) => !matchedDefinitionIds.has(definition.id))
    const activeTargetPackageExportStateByPackage = new Map<string, TargetExportPackageState>()
    for (const pkg of projectSyncablePackages) {
        if (!activeTarget || !targetPackageAvailability(activeTarget, selectedSyncUnit, pkg).available) {
            activeTargetPackageExportStateByPackage.set(pkg.packageId, 'blocked')
            continue
        }
        activeTargetPackageExportStateByPackage.set(
            pkg.packageId,
            activeTargetCurrentByPackage.has(pkg.packageId) || activeTargetManagedDefinitionByPackage.has(pkg.packageId)
                ? 'synced'
                : 'unsynced',
        )
    }
    const unsyncedPackageIds = projectSyncablePackages
        .filter((pkg) => activeTargetPackageExportStateByPackage.get(pkg.packageId) === 'unsynced')
        .map((pkg) => pkg.packageId)
    const activeSavePackageIds = !activeTarget
        ? []
        : stagedPackages
            .filter((pkg) => exportChoices[`${activeTarget.id}:${pkg.packageId}`] !== 'skip')
            .map((pkg) => pkg.packageId)
    const hasScopeCopyChanges = stagedScopeCopies.length > 0
    const hasTargetExportChanges = stagedPackageIds.length > 0 || Object.keys(exportChoices).length > 0
    const hasExportChanges = hasTargetExportChanges || hasScopeCopyChanges
    const targetExportBlocked = activeSavePackageIds.length > 0 && (selectedTargets.length === 0 || !targetsReady)
    const scopeCopySaveDisabled = running || !hasScopeCopyChanges
    const scopeCopyRevertDisabled = running || !hasScopeCopyChanges
    const targetSyncSaveDisabled = running || targetExportBlocked || activeSavePackageIds.length === 0
    const targetSyncRevertDisabled = running || !hasTargetExportChanges
    const saveDisabled = running || targetExportBlocked || (activeSavePackageIds.length === 0 && !hasScopeCopyChanges)
    const revertDisabled = running || !hasExportChanges
    const activeTargetPlanSteps = !activeTarget
        ? []
        : [
            activeSavePackageIds.length > 0 ? `Build a temp package from ${unitLabel(selectedSyncUnit)}.` : null,
            activeSavePackageIds.length > 0 ? `${activeSavePackageIds.length} Workspace item${activeSavePackageIds.length === 1 ? '' : 's'} marked Save.` : null,
            activeSavePackageIds.length > 0 ? `${toolingStatusLabel} install --target ${activeTarget.id}.` : null,
            activeSavePackageIds.length > 0 ? `Write managed project files into ${targetOutputHint(activeTarget, selectedSyncUnit)}.` : null,
            modelOmitted ? 'Keep model settings inside Studio runtime.' : null,
        ].filter((step): step is string => Boolean(step))

    return {
        activeSavePackageIds,
        activeTarget,
        activeTargetAvailability,
        activeTargetCurrentByPackage,
        activeTargetCurrentPackages,
        activeTargetDefinitionByPackage,
        activeTargetDefinitions,
        activeTargetPlanSteps,
        activeTargetResultByPackage,
        activeTargetPackageExportStateByPackage,
        availableTargetIds,
        availableTargetIdsKey: availableTargetIds.join('|'),
        syncableProjectPackages: projectSyncablePackages,
        syncableUserPackages: userSyncablePackages,
        projectPackageWarnings,
        userPackageWarnings,
        projectPackages,
        userPackages,
        projectCounts,
        userCounts,
        primitiveUnit,
        sidebarSection,
        selectableTargetIds,
        selectableTargetIdsKey: selectableTargetIds.join('|'),
        scopeCopyRevertDisabled,
        scopeCopySaveDisabled,
        stagedScopeCopies,
        stagedScopeCopyKeys: Array.from(stagedScopeCopySet),
        stagedScopeCopySet,
        stagedPackageIdsKey: stagedPackageIds.join('|'),
        stagedPackageSet,
        stagedPackages,
        stagedPrimitiveSummary,
        syncablePackageIds,
        syncablePackageIdsKey: syncablePackageIds.join('|'),
        hasExportChanges,
        revertDisabled,
        saveDisabled,
        targetOnlyDefinitions,
        targetExportBlocked,
        targetStates,
        targetSyncRevertDisabled,
        targetSyncSaveDisabled,
        targets,
        targetsReady,
        toolingStatusLabel,
        unsyncedPackageIds,
        unsyncedPackageIdsKey: unsyncedPackageIds.join('|'),
    }
}

export type TargetExportControllerModel = ReturnType<typeof buildTargetExportControllerModel>
