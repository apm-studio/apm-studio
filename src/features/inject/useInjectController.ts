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
} from './inject-sync-utils'
import {
    buildInjectControllerModel,
    normalizeInjectPackageSelection,
    normalizeInjectTargetSelection,
} from './inject-controller-model'

const EMPTY_APM_PACKAGES: ApmPackageSummary[] = []

export function useInjectController() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const [targetsResponse, setTargetsResponse] = useState<ApmSyncTargetsResponse | null>(null)
    const [selectedSyncUnit, setSelectedSyncUnit] = useState<ApmSyncUnit>(DEFAULT_APM_SYNC_UNIT)
    const [selectedTargets, setSelectedTargets] = useState<ApmSyncTargetId[]>(['codex'])
    const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([])
    const [loadingTargets, setLoadingTargets] = useState(false)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
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
            setError(err instanceof Error ? err.message : 'Unable to load inject targets.')
        } finally {
            setLoadingTargets(false)
        }
    }, [])

    useEffect(() => {
        void refreshTargets()
    }, [refreshTargets, workingDir])

    const model = useMemo(() => buildInjectControllerModel({
        apmPackages,
        targetsResponse,
        selectedSyncUnit,
        selectedTargets,
        selectedPackageIds,
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
        selectedPackageIds,
        selectedSyncUnit,
        selectedTargets,
        syncChoices,
        targetsResponse,
    ])

    useEffect(() => {
        setSelectedPackageIds((current) => {
            return normalizeInjectPackageSelection(current, model.syncablePackageIds)
        })
    }, [model.syncablePackageIds, model.syncablePackageIdsKey])

    useEffect(() => {
        setSelectedTargets((current) => {
            return normalizeInjectTargetSelection(current, model.availableTargetIds)
        })
    }, [model.availableTargetIds, model.availableTargetIdsKey])

    const runSync = useCallback(async () => {
        if (selectedTargets.length === 0 || model.activePushPackageIds.length === 0) return
        setRunning(true)
        setError(null)
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
        setSelectedSyncUnit(syncUnit)
        setLastResult(null)
    }, [])

    const setPackageSyncChoice = useCallback((packageId: string, choice: TargetSyncChoice) => {
        const activeTargetId = model.activeTarget?.id
        if (!activeTargetId) return
        setSyncChoices((current) => ({
            ...current,
            [`${activeTargetId}:${packageId}`]: choice,
        }))
    }, [model.activeTarget?.id])

    const selectTarget = useCallback((targetId: ApmSyncTargetId) => {
        if (!model.targetStates.get(targetId)?.available) return
        setSelectedTargets([targetId])
    }, [model.targetStates])

    const togglePackage = useCallback((packageId: string) => {
        setSelectedPackageIds((current) => {
            if (current.includes(packageId)) {
                return current.filter((id) => id !== packageId)
            }
            return [...current, packageId]
        })
    }, [])

    const toggleVisiblePackages = useCallback(() => {
        setSelectedPackageIds((current) => (
            model.allVisibleSelected
                ? current.filter((packageId) => !model.visiblePackageIds.includes(packageId))
                : Array.from(new Set([...current, ...model.visiblePackageIds]))
        ))
    }, [model.allVisibleSelected, model.visiblePackageIds])

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
        selectedPackageIds,
        selectedSyncUnit,
        setFilter,
        setPackageSyncChoice,
        syncChoices,
        targetsResponse,
        togglePackage,
        toggleVisiblePackages,
        workingDir,
    }
}

export type InjectControllerState = ReturnType<typeof useInjectController>
