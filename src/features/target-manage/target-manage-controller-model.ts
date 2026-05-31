import type {
    ApmPackageSummary,
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
    findManagedDefinitionForPackage,
    packageHasSyncUnit,
    packageSearchHaystack,
    primitiveSummary,
    primitiveUnitForSidebar,
    sidebarSectionForUnit,
    targetAvailability,
    targetPackageAvailability,
    type TargetManagePackageSyncState,
    type TargetSyncChoice,
    unitLabel,
} from './target-manage-sync-utils'

const EMPTY_TARGETS: ApmSyncTargetSummary[] = []

export interface TargetManageControllerModelInput {
    apmPackages: ApmPackageSummary[]
    targetsResponse: ApmSyncTargetsResponse | null
    selectedSyncUnit: ApmSyncUnit
    selectedTargets: ApmSyncTargetId[]
    stagedPackageIds: string[]
    filter: string
    syncChoices: Record<string, TargetSyncChoice>
    loadingTargets: boolean
    running: boolean
    lastResult: ApmSyncRunResponse | null
}

function sameOrderedValues(left: string[], right: string[]) {
    return left.length === right.length
        && left.every((value, index) => value === right[index])
}

export function normalizeTargetManageStagedPackages(
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

export function normalizeTargetManageTargetSelection(
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

export function buildTargetManageControllerModel(input: TargetManageControllerModelInput) {
    const {
        apmPackages,
        filter,
        lastResult,
        loadingTargets,
        running,
        stagedPackageIds,
        selectedSyncUnit,
        selectedTargets,
        syncChoices,
        targetsResponse,
    } = input

    const targets = targetsResponse?.targets || EMPTY_TARGETS
    const selectedTargetSet = new Set(selectedTargets)
    const stagedPackageSet = new Set(stagedPackageIds)
    const workspaceCounts = sumApmPackageSyncPrimitiveCounts(apmPackages)
    const sidebarSection = sidebarSectionForUnit(selectedSyncUnit)
    const primitiveUnit = primitiveUnitForSidebar(selectedSyncUnit)
    const syncablePackages = apmPackages.filter((pkg) => packageHasSyncUnit(pkg, selectedSyncUnit))
    const syncablePackageIds = syncablePackages.map((pkg) => pkg.packageId)
    const queryText = filter.trim().toLowerCase()
    const filteredSyncablePackages = syncablePackages.filter((pkg) =>
        !queryText || packageSearchHaystack(pkg).includes(queryText),
    )
    const visiblePackageIds = filteredSyncablePackages.map((pkg) => pkg.packageId)
    const stagedPackages = syncablePackages.filter((pkg) => stagedPackageSet.has(pkg.packageId))
    const stagedCounts = sumApmPackageSyncPrimitiveCounts(stagedPackages)
    const stagedPrimitiveSummary = primitiveSummary(stagedCounts, selectedSyncUnit)
    const targetStates = new Map(targets.map((target) => [
        target.id,
        targetAvailability(target, selectedSyncUnit, stagedPackages),
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
    const packageWarnings = syncablePackages.reduce((total, pkg) => total + (pkg.microsoftApm?.warnings.length || 0), 0)
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
    const activeTargetDefinitions = definitions.filter((definition) => {
        if (selectedSyncUnit === 'studio-agent') {
            return definition.managedSyncUnit === 'studio-agent'
                || definition.kind === 'agent'
                || definition.kind === 'skill'
                || definition.kind === 'mcp'
        }
        return !definition.syncUnit || definition.syncUnit === selectedSyncUnit
    })
    const activeTargetManagedDefinitionByPackage = new Map<string, ApmSyncTargetDefinitionSummary>()
    for (const pkg of syncablePackages) {
        const definition = findManagedDefinitionForPackage(activeTargetDefinitions, pkg)
        if (definition) activeTargetManagedDefinitionByPackage.set(pkg.packageId, definition)
    }
    const activeTargetDefinitionByPackage = new Map<string, ApmSyncTargetDefinitionSummary>()
    for (const pkg of stagedPackages) {
        const definition = activeTargetManagedDefinitionByPackage.get(pkg.packageId)
        if (definition) activeTargetDefinitionByPackage.set(pkg.packageId, definition)
    }
    const matchedDefinitionIds = new Set(Array.from(activeTargetManagedDefinitionByPackage.values()).map((definition) => definition.id))
    const targetOnlyDefinitions = activeTargetDefinitions.filter((definition) => !matchedDefinitionIds.has(definition.id))
    const activeTargetPackageSyncStateByPackage = new Map<string, TargetManagePackageSyncState>()
    for (const pkg of syncablePackages) {
        if (!activeTarget || !targetPackageAvailability(activeTarget, selectedSyncUnit, pkg).available) {
            activeTargetPackageSyncStateByPackage.set(pkg.packageId, 'blocked')
            continue
        }
        activeTargetPackageSyncStateByPackage.set(
            pkg.packageId,
            activeTargetCurrentByPackage.has(pkg.packageId) || activeTargetManagedDefinitionByPackage.has(pkg.packageId)
                ? 'synced'
                : 'unsynced',
        )
    }
    const unsyncedPackageIds = syncablePackages
        .filter((pkg) => activeTargetPackageSyncStateByPackage.get(pkg.packageId) === 'unsynced')
        .map((pkg) => pkg.packageId)
    const activePushPackageIds = !activeTarget
        ? []
        : stagedPackages
            .filter((pkg) => syncChoices[`${activeTarget.id}:${pkg.packageId}`] !== 'skip')
            .map((pkg) => pkg.packageId)
    const syncDisabled = running || selectedTargets.length === 0 || !targetsReady || activePushPackageIds.length === 0
    const activeTargetPlanSteps = !activeTarget
        ? []
        : [
            selectedSyncUnit === 'studio-agent'
                ? 'Compose each Studio Agent into one target agent artifact.'
                : `Build a temp package from ${unitLabel(selectedSyncUnit)}.`,
            `${activePushPackageIds.length} Studio item${activePushPackageIds.length === 1 ? '' : 's'} marked Push.`,
            `${toolingStatusLabel} install --target ${activeTarget.id}.`,
            `Write managed project files into ${activeTarget.outputHint}.`,
            modelOmitted ? 'Keep model settings inside Studio Agent runtime.' : null,
        ].filter((step): step is string => Boolean(step))

    return {
        activePushPackageIds,
        activeTarget,
        activeTargetAvailability,
        activeTargetCurrentByPackage,
        activeTargetDefinitionByPackage,
        activeTargetDefinitions,
        activeTargetPlanSteps,
        activeTargetResultByPackage,
        activeTargetPackageSyncStateByPackage,
        availableTargetIds,
        availableTargetIdsKey: availableTargetIds.join('|'),
        filteredSyncablePackages,
        packageWarnings,
        primitiveUnit,
        sidebarSection,
        selectableTargetIds,
        selectableTargetIdsKey: selectableTargetIds.join('|'),
        stagedPackageIdsKey: stagedPackageIds.join('|'),
        stagedPackageSet,
        stagedPackages,
        stagedPrimitiveSummary,
        syncablePackageIds,
        syncablePackageIdsKey: syncablePackageIds.join('|'),
        syncDisabled,
        targetOnlyDefinitions,
        targetStates,
        targets,
        targetsReady,
        toolingStatusLabel,
        unsyncedPackageIds,
        unsyncedPackageIdsKey: unsyncedPackageIds.join('|'),
        visiblePackageIds,
        workspaceCounts,
    }
}

export type TargetManageControllerModel = ReturnType<typeof buildTargetManageControllerModel>
