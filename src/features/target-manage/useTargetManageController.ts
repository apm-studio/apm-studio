import { useCallback, useEffect, useMemo, useState } from 'react'
import { apmApi } from '../../api-clients/apm'
import { useApmPackages } from '../../hooks/queries/apm'
import { useStudioStore } from '../../store'
import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncRunResponse,
    ApmSyncTargetId,
    ApmSyncTargetsResponse,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts'
import {
    DEFAULT_APM_SYNC_UNIT,
} from '../../../shared/apm-sync-contracts'
import {
    type TargetSyncChoice,
    targetPackageAvailability,
    unitLabel,
} from './target-manage-sync-utils'
import {
    buildTargetManageControllerModel,
    normalizeTargetManageStagedPackages,
    normalizeTargetManageTargetSelection,
} from './target-manage-controller-model'

const EMPTY_APM_PACKAGES: ApmPackageSummary[] = []

export function useTargetManageController() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const [targetsResponse, setTargetsResponse] = useState<ApmSyncTargetsResponse | null>(null)
    const [selectedSyncUnit, setSelectedSyncUnit] = useState<ApmSyncUnit>(DEFAULT_APM_SYNC_UNIT)
    const [selectedTargets, setSelectedTargets] = useState<ApmSyncTargetId[]>(['codex'])
    const [stagedPackageIds, setStagedPackageIds] = useState<string[]>([])
    const [loadingTargets, setLoadingTargets] = useState(false)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [targetMessage, setTargetMessage] = useState<string | null>(null)
    const [lastResult, setLastResult] = useState<ApmSyncRunResponse | null>(null)
    const [filter, setFilter] = useState('')
    const [syncChoices, setSyncChoices] = useState<Record<string, TargetSyncChoice>>({})
    const {
        data: apmPackages = EMPTY_APM_PACKAGES,
        isLoading: apmPackagesLoading,
        refetch: refetchPackages,
    } = useApmPackages()

    const refreshTargets = useCallback(async () => {
        setLoadingTargets(true)
        setError(null)
        try {
            setTargetsResponse(await apmApi.listSyncTargets())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load target definitions.')
        } finally {
            setLoadingTargets(false)
        }
    }, [])

    useEffect(() => {
        void refreshTargets()
    }, [refreshTargets, workingDir])

    const model = useMemo(() => buildTargetManageControllerModel({
        apmPackages,
        targetsResponse,
        selectedSyncUnit,
        selectedTargets,
        stagedPackageIds,
        filter,
        syncChoices,
        loadingTargets,
        running,
        lastResult,
    }), [
        apmPackages,
        filter,
        lastResult,
        loadingTargets,
        running,
        selectedSyncUnit,
        selectedTargets,
        stagedPackageIds,
        syncChoices,
        targetsResponse,
    ])

    useEffect(() => {
        setStagedPackageIds((current) => {
            return normalizeTargetManageStagedPackages(current, model.syncablePackageIds)
        })
    }, [model.syncablePackageIds, model.syncablePackageIdsKey])

    useEffect(() => {
        setSelectedTargets((current) => {
            return normalizeTargetManageTargetSelection(current, model.selectableTargetIds)
        })
    }, [model.selectableTargetIds, model.selectableTargetIdsKey])

    const runSync = useCallback(async () => {
        if (selectedTargets.length === 0 || model.activePushPackageIds.length === 0) return
        setRunning(true)
        setError(null)
        setTargetMessage(null)
        setLastResult(null)
        try {
            const response = await apmApi.runTargetSync({
                targets: selectedTargets,
                packageIds: model.activePushPackageIds,
                syncUnit: selectedSyncUnit,
            })
            setLastResult(response)
            await refetchPackages()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sync failed.')
        } finally {
            setRunning(false)
        }
    }, [model.activePushPackageIds, refetchPackages, selectedSyncUnit, selectedTargets])

    const selectSyncUnit = useCallback((syncUnit: ApmSyncUnit) => {
        if (syncUnit !== selectedSyncUnit) {
            setStagedPackageIds([])
            setSyncChoices({})
            setTargetMessage(null)
        }
        setSelectedSyncUnit(syncUnit)
        setLastResult(null)
    }, [selectedSyncUnit])

    const setPackageSyncChoice = useCallback((packageId: string, choice: TargetSyncChoice) => {
        const activeTargetId = model.activeTarget?.id
        if (!activeTargetId) return
        setSyncChoices((current) => ({
            ...current,
            [`${activeTargetId}:${packageId}`]: choice,
        }))
    }, [model.activeTarget?.id])

    const selectTarget = useCallback((targetId: ApmSyncTargetId) => {
        const target = model.targets.find((candidate) => candidate.id === targetId)
        if (!target?.available) return
        if (selectedTargets[0] !== targetId) {
            setStagedPackageIds([])
            setSyncChoices({})
            setTargetMessage(null)
            setLastResult(null)
        }
        setSelectedTargets([targetId])
    }, [model.targets, selectedTargets])

    const stagePackageForActiveTarget = useCallback((packageId: string, syncUnit: ApmSyncUnit = selectedSyncUnit) => {
        const target = model.activeTarget
        const pkg = apmPackages.find((candidate) => candidate.packageId === packageId)
        if (!pkg) {
            setTargetMessage('Package is no longer available in this workspace.')
            return false
        }
        if (!target) {
            setTargetMessage('Select a target first.')
            return false
        }
        const availability = targetPackageAvailability(target, syncUnit, pkg)
        if (!availability.available) {
            setTargetMessage(availability.reason || `${target.label} cannot receive ${unitLabel(syncUnit)}.`)
            return false
        }

        if (syncUnit !== selectedSyncUnit) {
            setSelectedSyncUnit(syncUnit)
            setStagedPackageIds([packageId])
            setSyncChoices({ [`${target.id}:${packageId}`]: 'push' })
        } else {
            setStagedPackageIds((current) => (
                current.includes(packageId) ? current : [...current, packageId]
            ))
            setSyncChoices((current) => ({
                ...current,
                [`${target.id}:${packageId}`]: 'push',
            }))
        }
        setTargetMessage(`${pkg.agentName || pkg.name} staged for ${target.label}.`)
        setLastResult(null)
        return true
    }, [apmPackages, model.activeTarget, selectedSyncUnit])

    const toggleStagedPackage = useCallback((packageId: string) => {
        if (stagedPackageIds.includes(packageId)) {
            setStagedPackageIds((current) => current.filter((id) => id !== packageId))
            setTargetMessage('Removed from Push queue.')
            setLastResult(null)
            return
        }
        void stagePackageForActiveTarget(packageId)
    }, [stagePackageForActiveTarget, stagedPackageIds])

    return {
        ...model,
        apmPackages,
        apmPackagesLoading,
        error,
        filter,
        loadingTargets,
        refreshTargets,
        running,
        runSync,
        selectSyncUnit,
        selectTarget,
        selectedSyncUnit,
        setFilter,
        setPackageSyncChoice,
        stagePackageForActiveTarget,
        stagedPackageIds,
        syncChoices,
        targetMessage,
        targetsResponse,
        toggleStagedPackage,
        workingDir,
    }
}

export type TargetManageControllerState = ReturnType<typeof useTargetManageController>
