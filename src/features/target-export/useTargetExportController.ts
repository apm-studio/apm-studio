import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apmApi } from '../../api-clients/apm'
import { useApmPackages } from '../../hooks/queries/apm'
import { useStudioStore } from '../../store'
import type {
    ApmPackageScope,
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncRunResponse,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetId,
    ApmSyncTargetsResponse,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts'
import {
    DEFAULT_APM_SYNC_UNIT,
} from '../../../shared/apm-sync-contracts'
import {
    type TargetExportChoice,
    packageScopeLabel,
    scopeTargetExportPackages,
    targetPackageAvailability,
    unitLabel,
} from './target-export-sync-utils'
import {
    buildTargetExportControllerModel,
    normalizeTargetExportStagedPackages,
    normalizeTargetExportStagedScopeCopies,
    normalizeTargetExportTargetSelection,
    targetExportScopeCopyKey,
    type TargetExportScopeCopy,
} from './target-export-controller-model'

const EMPTY_APM_PACKAGES: ApmPackageSummary[] = []

export function useTargetExportController() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const targetsRequestIdRef = useRef(0)
    const [targetsResponse, setTargetsResponse] = useState<ApmSyncTargetsResponse | null>(null)
    const [selectedSyncUnit, setSelectedSyncUnit] = useState<ApmSyncUnit>(DEFAULT_APM_SYNC_UNIT)
    const [selectedTargets, setSelectedTargets] = useState<ApmSyncTargetId[]>(['codex'])
    const [stagedPackageIds, setStagedPackageIds] = useState<string[]>([])
    const [stagedScopeCopies, setStagedScopeCopies] = useState<TargetExportScopeCopy[]>([])
    const [loadingTargets, setLoadingTargets] = useState(false)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [targetMessage, setTargetMessage] = useState<string | null>(null)
    const [lastResult, setLastResult] = useState<ApmSyncRunResponse | null>(null)
    const [exportChoices, setExportChoices] = useState<Record<string, TargetExportChoice>>({})
    const [importingTargetDefinitionIds, setImportingTargetDefinitionIds] = useState<string[]>([])
    const {
        data: rawProjectPackages = EMPTY_APM_PACKAGES,
        isLoading: projectPackagesLoading,
        refetch: refetchProjectPackages,
    } = useApmPackages(true, 'workspace')
    const {
        data: rawUserPackages = EMPTY_APM_PACKAGES,
        isLoading: userPackagesLoading,
        refetch: refetchUserPackages,
    } = useApmPackages(true, 'user')
    const projectPackages = useMemo(() => (
        scopeTargetExportPackages(rawProjectPackages, 'workspace')
    ), [rawProjectPackages])
    const userPackages = useMemo(() => (
        scopeTargetExportPackages(rawUserPackages, 'user')
    ), [rawUserPackages])
    const apmPackagesLoading = projectPackagesLoading || userPackagesLoading

    const refreshTargets = useCallback(async () => {
        const requestId = targetsRequestIdRef.current + 1
        const requestWorkingDir = useStudioStore.getState().workingDir
        targetsRequestIdRef.current = requestId
        setLoadingTargets(true)
        setError(null)
        try {
            const response = await apmApi.listSyncTargets()
            if (
                targetsRequestIdRef.current === requestId
                && useStudioStore.getState().workingDir === requestWorkingDir
            ) {
                setTargetsResponse(response)
            }
        } catch (err) {
            if (
                targetsRequestIdRef.current === requestId
                && useStudioStore.getState().workingDir === requestWorkingDir
            ) {
                setError(err instanceof Error ? err.message : 'Unable to load target definitions.')
            }
        } finally {
            if (
                targetsRequestIdRef.current === requestId
                && useStudioStore.getState().workingDir === requestWorkingDir
            ) {
                setLoadingTargets(false)
            }
        }
    }, [])

    useEffect(() => {
        setTargetsResponse(null)
        setStagedPackageIds([])
        setStagedScopeCopies([])
        setExportChoices({})
        setTargetMessage(null)
        setLastResult(null)
        setError(null)
        setRunning(false)
        setImportingTargetDefinitionIds([])
        void refreshTargets()
    }, [refreshTargets, workingDir])

    const model = useMemo(() => buildTargetExportControllerModel({
        projectPackages,
        userPackages,
        targetsResponse,
        selectedSyncUnit,
        selectedTargets,
        stagedPackageIds,
        stagedScopeCopies,
        exportChoices,
        loadingTargets,
        running,
        lastResult,
    }), [
        projectPackages,
        userPackages,
        lastResult,
        loadingTargets,
        running,
        selectedSyncUnit,
        selectedTargets,
        stagedPackageIds,
        stagedScopeCopies,
        exportChoices,
        targetsResponse,
    ])

    useEffect(() => {
        setStagedPackageIds((current) => {
            return normalizeTargetExportStagedPackages(current, model.syncablePackageIds)
        })
    }, [model.syncablePackageIds, model.syncablePackageIdsKey])

    useEffect(() => {
        setSelectedTargets((current) => {
            return normalizeTargetExportTargetSelection(current, model.selectableTargetIds)
        })
    }, [model.selectableTargetIds, model.selectableTargetIdsKey])

    useEffect(() => {
        setStagedScopeCopies((current) => normalizeTargetExportStagedScopeCopies(current, {
            workspace: projectPackages.map((pkg) => pkg.packageId),
            user: userPackages.map((pkg) => pkg.packageId),
        }))
    }, [projectPackages, userPackages])

    const revertExportChanges = useCallback(() => {
        setStagedPackageIds([])
        setStagedScopeCopies([])
        setExportChoices({})
        setTargetMessage('Reverted staged export changes.')
        setLastResult(null)
    }, [])

    const saveExport = useCallback(async () => {
        if (model.activeSavePackageIds.length === 0 && model.stagedScopeCopies.length === 0) return
        const workingDirAtSubmit = useStudioStore.getState().workingDir
        setRunning(true)
        setError(null)
        setTargetMessage(null)
        setLastResult(null)
        try {
            for (const copy of model.stagedScopeCopies) {
                await apmApi.copyPackage(copy)
            }

            const response = model.activeSavePackageIds.length > 0
                ? await apmApi.runTargetSync({
                    targets: selectedTargets,
                    packageIds: model.activeSavePackageIds,
                    syncUnit: selectedSyncUnit,
                })
                : null
            if (useStudioStore.getState().workingDir !== workingDirAtSubmit) return
            setLastResult(response)
            await Promise.all([
                refetchProjectPackages(),
                refetchUserPackages(),
            ])
            await refreshTargets()
            if (useStudioStore.getState().workingDir !== workingDirAtSubmit) return
            setStagedPackageIds([])
            setStagedScopeCopies([])
            setExportChoices({})

            const targetLabel = model.activeTarget?.label || 'target'
            const copyCount = model.stagedScopeCopies.length
            const targetCount = model.activeSavePackageIds.length
            const messages = [
                copyCount > 0 ? `Copied ${copyCount} package${copyCount === 1 ? '' : 's'} between User and Workspace.` : null,
                targetCount > 0 ? `Saved export changes to ${targetLabel}.` : null,
            ].filter((entry): entry is string => Boolean(entry))
            setTargetMessage(messages.join(' '))
        } catch (err) {
            if (useStudioStore.getState().workingDir === workingDirAtSubmit) {
                setError(err instanceof Error ? err.message : 'Save failed.')
            }
        } finally {
            if (useStudioStore.getState().workingDir === workingDirAtSubmit) {
                setRunning(false)
            }
        }
    }, [
        model.activeSavePackageIds,
        model.activeTarget?.label,
        model.stagedScopeCopies,
        refetchProjectPackages,
        refetchUserPackages,
        refreshTargets,
        selectedSyncUnit,
        selectedTargets,
    ])

    const selectSyncUnit = useCallback((syncUnit: ApmSyncUnit) => {
        if (syncUnit !== selectedSyncUnit) {
            setStagedPackageIds([])
            setExportChoices({})
            setTargetMessage(null)
        }
        setSelectedSyncUnit(syncUnit)
        setLastResult(null)
    }, [selectedSyncUnit])

    const setPackageExportChoice = useCallback((packageId: string, choice: TargetExportChoice) => {
        const activeTargetId = model.activeTarget?.id
        if (!activeTargetId) return
        setExportChoices((current) => ({
            ...current,
            [`${activeTargetId}:${packageId}`]: choice,
        }))
    }, [model.activeTarget?.id])

    const importTargetDefinition = useCallback(async (definition: ApmSyncTargetDefinitionSummary) => {
        const workingDirAtSubmit = useStudioStore.getState().workingDir
        const target = model.targets.find((candidate) => candidate.id === definition.target)
        setImportingTargetDefinitionIds((current) => (
            current.includes(definition.id) ? current : [...current, definition.id]
        ))
        setError(null)
        setTargetMessage(null)
        setLastResult(null)
        try {
            const response = await apmApi.importTargetDefinition({
                target: definition.target,
                path: definition.path,
                scope: 'workspace',
            })
            if (useStudioStore.getState().workingDir !== workingDirAtSubmit) return
            await refetchProjectPackages()
            await refreshTargets()
            if (useStudioStore.getState().workingDir !== workingDirAtSubmit) return
            const packageNames = response.packages.map((pkg) => pkg.name).join(', ')
            const targetLabel = target?.label || definition.target
            const warning = response.warnings[0] ? ` ${response.warnings[0]}` : ''
            setTargetMessage(`Imported ${packageNames || 'target definition'} into Workspace. Stage it and Save to make ${targetLabel} managed.${warning}`)
        } catch (err) {
            if (useStudioStore.getState().workingDir === workingDirAtSubmit) {
                setError(err instanceof Error ? err.message : 'Target import failed.')
            }
        } finally {
            if (useStudioStore.getState().workingDir === workingDirAtSubmit) {
                setImportingTargetDefinitionIds((current) => current.filter((id) => id !== definition.id))
            }
        }
    }, [model.targets, refetchProjectPackages, refreshTargets])

    const selectTarget = useCallback((targetId: ApmSyncTargetId) => {
        const target = model.targets.find((candidate) => candidate.id === targetId)
        if (!target?.available) return
        if (selectedTargets[0] !== targetId) {
            setStagedPackageIds([])
            setExportChoices({})
            setTargetMessage(null)
            setLastResult(null)
        }
        setSelectedTargets([targetId])
    }, [model.targets, selectedTargets])

    const stagePackageForActiveTarget = useCallback((packageId: string, syncUnit: ApmSyncUnit = selectedSyncUnit) => {
        const target = model.activeTarget
        const pkg = projectPackages.find((candidate) => candidate.packageId === packageId)
        if (!pkg) {
            const userPackage = userPackages.find((candidate) => candidate.packageId === packageId)
            setTargetMessage(userPackage
                ? 'Copy this User package to Workspace before exporting into a target.'
                : 'Package is no longer available in this workspace.')
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
            setExportChoices({ [`${target.id}:${packageId}`]: 'save' })
        } else {
            setStagedPackageIds((current) => (
                current.includes(packageId) ? current : [...current, packageId]
            ))
            setExportChoices((current) => ({
                ...current,
                [`${target.id}:${packageId}`]: 'save',
            }))
        }
        setTargetMessage(`${pkg.agentName || pkg.name} staged for ${target.label}.`)
        setLastResult(null)
        return true
    }, [model.activeTarget, projectPackages, selectedSyncUnit, userPackages])

    const stageScopeCopy = useCallback((packageId: string, fromScope: ApmPackageScope, toScope: ApmPackageScope) => {
        if (fromScope === toScope) return false
        const sourcePackages = fromScope === 'user' ? userPackages : projectPackages
        const pkg = sourcePackages.find((candidate) => candidate.packageId === packageId)
        if (!pkg) {
            setTargetMessage(`${packageScopeLabel(fromScope)} package is no longer available.`)
            return false
        }
        const copy: TargetExportScopeCopy = { packageId, fromScope, toScope }
        const key = targetExportScopeCopyKey(copy)
        setStagedScopeCopies((current) => (
            current.some((entry) => targetExportScopeCopyKey(entry) === key) ? current : [...current, copy]
        ))
        setTargetMessage(`${pkg.agentName || pkg.name} staged to copy to ${packageScopeLabel(toScope)}.`)
        setLastResult(null)
        return true
    }, [projectPackages, userPackages])

    const toggleStagedScopeCopy = useCallback((packageId: string, fromScope: ApmPackageScope, toScope: ApmPackageScope) => {
        const key = targetExportScopeCopyKey({ packageId, fromScope, toScope })
        const exists = stagedScopeCopies.some((copy) => targetExportScopeCopyKey(copy) === key)
        if (exists) {
            setStagedScopeCopies((current) => current.filter((copy) => targetExportScopeCopyKey(copy) !== key))
            setTargetMessage('Removed package copy from staged changes.')
            setLastResult(null)
            return
        }
        void stageScopeCopy(packageId, fromScope, toScope)
    }, [stageScopeCopy, stagedScopeCopies])

    const toggleStagedPackage = useCallback((packageId: string) => {
        if (stagedPackageIds.includes(packageId)) {
            setStagedPackageIds((current) => current.filter((id) => id !== packageId))
            setTargetMessage('Removed from staged export changes.')
            setLastResult(null)
            return
        }
        void stagePackageForActiveTarget(packageId)
    }, [stagePackageForActiveTarget, stagedPackageIds])

    return {
        ...model,
        apmPackagesLoading,
        error,
        loadingTargets,
        refreshTargets,
        revertExportChanges,
        running,
        saveExport,
        selectSyncUnit,
        selectTarget,
        selectedSyncUnit,
        setPackageExportChoice,
        stagePackageForActiveTarget,
        stageScopeCopy,
        stagedPackageIds,
        stagedScopeCopies,
        exportChoices,
        importTargetDefinition,
        importingTargetDefinitionIds,
        targetMessage,
        targetsResponse,
        toggleStagedPackage,
        toggleStagedScopeCopy,
        workingDir,
    }
}

export type TargetExportControllerState = ReturnType<typeof useTargetExportController>
