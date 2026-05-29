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
    type TargetSyncChoice,
    unitLabel,
} from './inject-sync-utils'

const EMPTY_TARGETS: ApmSyncTargetSummary[] = []

export interface InjectControllerModelInput {
    apmPackages: ApmPackageSummary[]
    targetsResponse: ApmSyncTargetsResponse | null
    selectedSyncUnit: ApmSyncUnit
    selectedTargets: ApmSyncTargetId[]
    selectedPackageIds: string[]
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

export function normalizeInjectPackageSelection(
    current: string[],
    syncablePackageIds: string[],
) {
    if (syncablePackageIds.length === 0) {
        return current.length === 0 ? current : []
    }

    const valid = current.filter((packageId) => syncablePackageIds.includes(packageId))
    if (current.length === 0) {
        return syncablePackageIds
    }
    if (sameOrderedValues(valid, current)) {
        return current
    }
    if (valid.length > 0) {
        return valid
    }
    return syncablePackageIds
}

export function normalizeInjectTargetSelection(
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

export function buildInjectControllerModel(input: InjectControllerModelInput) {
    const {
        apmPackages,
        filter,
        lastResult,
        loadingTargets,
        running,
        selectedPackageIds,
        selectedSyncUnit,
        selectedTargets,
        syncChoices,
        targetsResponse,
    } = input

    const targets = targetsResponse?.targets || EMPTY_TARGETS
    const selectedTargetSet = new Set(selectedTargets)
    const selectedPackageSet = new Set(selectedPackageIds)
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
    const allVisibleSelected = visiblePackageIds.length > 0
        && visiblePackageIds.every((packageId) => selectedPackageSet.has(packageId))
    const selectedPackages = syncablePackages.filter((pkg) => selectedPackageSet.has(pkg.packageId))
    const selectedCounts = sumApmPackageSyncPrimitiveCounts(selectedPackages)
    const selectedPrimitiveSummary = primitiveSummary(selectedCounts, selectedSyncUnit)
    const targetStates = new Map(targets.map((target) => [
        target.id,
        targetAvailability(target, selectedSyncUnit, selectedPackages),
    ]))
    const availableTargetIds = targets
        .filter((target) => targetStates.get(target.id)?.available)
        .map((target) => target.id)
    const activeTargets = targets.filter((target) => selectedTargetSet.has(target.id))
    const activeTarget = activeTargets[0] || targets.find((target) => targetStates.get(target.id)?.available) || targets[0] || null
    const activeTargetAvailability = activeTarget
        ? targetStates.get(activeTarget.id) || { available: false, reason: 'Target unavailable.' }
        : null
    const targetsReady = activeTargets.length > 0
        && activeTargets.every((target) => targetStates.get(target.id)?.available)
    const packageWarnings = syncablePackages.reduce((total, pkg) => total + (pkg.microsoftApm?.warnings.length || 0), 0)
    const modelOmitted = selectedPackages.some((pkg) => pkg.agentComponents?.model)
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
        selectedSyncUnit === 'agent-packages' || item.syncUnit === selectedSyncUnit
    ))
    const activeTargetCurrentByPackage = new Map(matchingCurrentItems.map((item) => [item.packageId, item]))
    const definitions = activeTarget?.definitions || []
    const activeTargetDefinitions = definitions.filter((definition) => (
        selectedSyncUnit === 'agent-packages'
        || !definition.syncUnit
        || definition.syncUnit === selectedSyncUnit
    ))
    const activeTargetDefinitionByPackage = new Map<string, ApmSyncTargetDefinitionSummary>()
    for (const pkg of selectedPackages) {
        const definition = findManagedDefinitionForPackage(activeTargetDefinitions, pkg)
        if (definition) activeTargetDefinitionByPackage.set(pkg.packageId, definition)
    }
    const matchedDefinitionIds = new Set(Array.from(activeTargetDefinitionByPackage.values()).map((definition) => definition.id))
    const targetOnlyDefinitions = activeTargetDefinitions.filter((definition) => !matchedDefinitionIds.has(definition.id))
    const activePushPackageIds = !activeTarget
        ? []
        : selectedPackages
            .filter((pkg) => syncChoices[`${activeTarget.id}:${pkg.packageId}`] !== 'skip')
            .map((pkg) => pkg.packageId)
    const syncDisabled = running || selectedTargets.length === 0 || !targetsReady || activePushPackageIds.length === 0
    const activeTargetPlanSteps = !activeTarget
        ? []
        : [
            selectedSyncUnit === 'agent-packages'
                ? 'Use the selected package root.'
                : `Build a temp package from ${unitLabel(selectedSyncUnit)}.`,
            `${activePushPackageIds.length} Studio item${activePushPackageIds.length === 1 ? '' : 's'} marked Push.`,
            `${toolingStatusLabel} install --target ${activeTarget.id}.`,
            `Write managed project files into ${activeTarget.outputHint}.`,
            modelOmitted ? 'Keep model settings inside Studio Run.' : null,
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
        allVisibleSelected,
        availableTargetIds,
        availableTargetIdsKey: availableTargetIds.join('|'),
        filteredSyncablePackages,
        packageWarnings,
        primitiveUnit,
        selectedPackageSet,
        selectedPackages,
        selectedPrimitiveSummary,
        sidebarSection,
        syncablePackageIds,
        syncablePackageIdsKey: syncablePackageIds.join('|'),
        syncDisabled,
        targetOnlyDefinitions,
        targetStates,
        targets,
        targetsReady,
        toolingStatusLabel,
        visiblePackageIds,
        workspaceCounts,
    }
}

export type InjectControllerModel = ReturnType<typeof buildInjectControllerModel>
