import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, FileText, Layers3, PackageOpen, RefreshCcw, RotateCw, Search, Server, Zap } from 'lucide-react'
import { api } from '../../api'
import { useAppHeader } from '../../components/AppHeaderContext'
import { useApmPackages } from '../../hooks/queries'
import { useStudioStore } from '../../store'
import type {
    ApmExportUnit,
    ApmPackageSummary,
    ApmSyncRunResponse,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetId,
    ApmSyncTargetSummary,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-contracts'
import './ExportPage.css'

const EXPORT_UNITS: Array<{ id: ApmExportUnit; label: string; description: string }> = [
    { id: 'agent-packages', label: 'Agent Packages', description: 'Complete Studio package' },
    { id: 'agents', label: 'Agents', description: 'Agent primitive only' },
    { id: 'instructions', label: 'Instructions', description: 'Instruction primitive only' },
    { id: 'skills', label: 'Skills', description: 'Skill primitive only' },
    { id: 'mcp', label: 'MCP', description: 'MCP dependency config' },
]

const EMPTY_APM_PACKAGES: ApmPackageSummary[] = []
const EMPTY_TARGETS: ApmSyncTargetSummary[] = []

type PrimitiveCounts = {
    agents: number
    instructions: number
    skills: number
    mcp: number
}

type ExportSidebarSection = 'packages' | 'primitives'
type PrimitiveExportUnit = Exclude<ApmExportUnit, 'agent-packages'>
type TargetSyncChoice = 'push' | 'skip'

const PRIMITIVE_LABELS: Record<keyof PrimitiveCounts, { one: string; many: string }> = {
    agents: { one: 'agent', many: 'agents' },
    instructions: { one: 'instruction', many: 'instructions' },
    skills: { one: 'skill', many: 'skills' },
    mcp: { one: 'MCP', many: 'MCP' },
}

function unitLabel(unit: ApmExportUnit) {
    return EXPORT_UNITS.find((entry) => entry.id === unit)?.label || unit
}

function sidebarSectionForUnit(unit: ApmExportUnit): ExportSidebarSection {
    return unit === 'agent-packages' ? 'packages' : 'primitives'
}

function primitiveUnitForSidebar(unit: ApmExportUnit): PrimitiveExportUnit {
    return unit === 'agent-packages' ? 'agents' : unit
}

function primitiveCounts(pkg: ApmPackageSummary): PrimitiveCounts {
    const counts = pkg.microsoftApm?.primitiveCounts
    return {
        agents: counts?.agents || 0,
        instructions: counts?.instructions || 0,
        skills: counts?.skills || 0,
        mcp: pkg.kind === 'mcp' ? 1 : pkg.agentComponents?.mcp || 0,
    }
}

function addPrimitiveCounts(packages: ApmPackageSummary[]) {
    return packages.reduce<PrimitiveCounts>((total, pkg) => {
        const counts = primitiveCounts(pkg)
        total.agents += counts.agents
        total.instructions += counts.instructions
        total.skills += counts.skills
        total.mcp += counts.mcp
        return total
    }, { agents: 0, instructions: 0, skills: 0, mcp: 0 })
}

function primitiveCountParts(counts: PrimitiveCounts, exportUnit: ApmExportUnit = 'agent-packages') {
    const keys: Array<keyof PrimitiveCounts> = exportUnit === 'agent-packages'
        ? ['agents', 'instructions', 'skills', 'mcp']
        : [exportUnit]
    return keys
        .map((key) => {
            const value = counts[key]
            if (value <= 0) return null
            const labels = PRIMITIVE_LABELS[key]
            return `${value} ${value === 1 ? labels.one : labels.many}`
        })
        .filter(Boolean) as string[]
}

function primitiveSummary(counts: PrimitiveCounts, exportUnit: ApmExportUnit = 'agent-packages') {
    return primitiveCountParts(counts, exportUnit).join(', ') || `No ${unitLabel(exportUnit)}`
}

function packageIcon(pkg: ApmPackageSummary, exportUnit: ApmExportUnit) {
    if (exportUnit === 'agents' || pkg.kind === 'agent') return <Bot size={12} className="asset-icon performer" />
    if (exportUnit === 'instructions' || pkg.kind === 'instruction') return <FileText size={12} className="asset-icon tal" />
    if (exportUnit === 'skills' || pkg.kind === 'skill') return <Zap size={12} className="asset-icon dance" />
    if (exportUnit === 'mcp' || pkg.kind === 'mcp') return <Server size={12} className="asset-icon mcp" />
    return <PackageOpen size={12} className="asset-icon combo" />
}

function packageSearchHaystack(pkg: ApmPackageSummary) {
    const counts = primitiveCounts(pkg)
    return [
        pkg.name,
        pkg.packageId,
        pkg.description,
        pkg.kind,
        pkg.agentName,
        pkg.derivedFrom,
        pkg.manifestPath,
        pkg.microsoftApm?.packageRoot,
        `${counts.agents} agents ${counts.instructions} instructions ${counts.skills} skills ${counts.mcp} mcp`,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

function packagePrimitiveUnits(pkg: ApmPackageSummary): ApmExportUnit[] {
    const counts = primitiveCounts(pkg)
    const units: ApmExportUnit[] = []
    if (counts.agents > 0) units.push('agents')
    if (counts.instructions > 0) units.push('instructions')
    if (counts.skills > 0) units.push('skills')
    if (counts.mcp > 0) units.push('mcp')
    return units
}

function packageHasUnit(pkg: ApmPackageSummary, exportUnit: ApmExportUnit) {
    if (exportUnit === 'agent-packages') return packagePrimitiveUnits(pkg).length > 0
    return packagePrimitiveUnits(pkg).includes(exportUnit)
}

function unitSourcePath(exportUnit: ApmExportUnit) {
    switch (exportUnit) {
        case 'agent-packages':
            return '.apm-studio/packages/*'
        case 'agents':
            return '.apm-studio/packages/*/.apm/agents'
        case 'instructions':
            return '.apm-studio/packages/*/.apm/instructions'
        case 'skills':
            return '.apm-studio/packages/*/.apm/skills'
        case 'mcp':
            return 'apm.yml dependencies.mcp'
        default:
            return '.apm-studio/packages/*'
    }
}

function packageReadiness(pkg: ApmPackageSummary, exportUnit: ApmExportUnit) {
    if (!packageHasUnit(pkg, exportUnit)) {
        return { label: 'No unit', title: `Package does not contain ${unitLabel(exportUnit)}.` }
    }
    const warnings = pkg.microsoftApm?.warnings || []
    return warnings.length > 0
        ? { label: 'Check', title: warnings.join('\n') }
        : { label: 'Ready', title: `${unitLabel(exportUnit)} can be synced from this package.` }
}

function targetAvailability(
    target: ApmSyncTargetSummary,
    exportUnit: ApmExportUnit,
    selectedPackages: ApmPackageSummary[],
) {
    if (!target.available) {
        return { available: false, reason: target.disabledReason || 'Target unavailable.' }
    }
    if (exportUnit !== 'agent-packages') {
        const supported = target.supportedExportUnits.includes(exportUnit)
        return {
            available: supported,
            reason: supported ? null : `${target.label} does not support ${unitLabel(exportUnit)}.`,
        }
    }

    const unsupportedPackage = selectedPackages.find((pkg) => {
        const units = packagePrimitiveUnits(pkg)
        return units.length === 0 || units.some((unit) => !target.supportedExportUnits.includes(unit))
    })
    return {
        available: !unsupportedPackage,
        reason: unsupportedPackage
            ? `${target.label} cannot receive every primitive in ${unsupportedPackage.agentName || unsupportedPackage.name}.`
            : null,
    }
}

function targetPackageAvailability(
    target: ApmSyncTargetSummary,
    exportUnit: ApmExportUnit,
    pkg: ApmPackageSummary,
) {
    return targetAvailability(target, exportUnit, [pkg])
}

function normalizedMatchKey(value: string | undefined | null) {
    return (value || '')
        .toLowerCase()
        .replace(/\.[^.]+$/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function findDefinitionForPackage(
    definitions: ApmSyncTargetDefinitionSummary[],
    pkg: ApmPackageSummary,
) {
    const packageKeys = new Set([
        normalizedMatchKey(pkg.packageId),
        normalizedMatchKey(pkg.name),
        normalizedMatchKey(pkg.agentName),
    ].filter(Boolean))

    return definitions.find((definition) => definition.managedPackageId === pkg.packageId)
        || definitions.find((definition) => packageKeys.has(normalizedMatchKey(definition.name)))
        || definitions.find((definition) => packageKeys.has(normalizedMatchKey(definition.path.split('/').at(-1))))
        || null
}

export function ExportPage() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const [targetsResponse, setTargetsResponse] = useState<ApmSyncTargetsResponse | null>(null)
    const [selectedExportUnit, setSelectedExportUnit] = useState<ApmExportUnit>('agent-packages')
    const [selectedTargets, setSelectedTargets] = useState<ApmSyncTargetId[]>(['codex'])
    const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([])
    const [loadingTargets, setLoadingTargets] = useState(false)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [lastResult, setLastResult] = useState<ApmSyncRunResponse | null>(null)
    const [filter, setFilter] = useState('')
    const [syncChoices, setSyncChoices] = useState<Record<string, TargetSyncChoice>>({})
    const { data: apmPackages = EMPTY_APM_PACKAGES, isLoading: apmPackagesLoading, refetch: refetchPackages } = useApmPackages()

    const refreshTargets = useCallback(async () => {
        setLoadingTargets(true)
        setError(null)
        try {
            setTargetsResponse(await api.apm.syncTargets())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load export targets.')
        } finally {
            setLoadingTargets(false)
        }
    }, [])

    useEffect(() => {
        void refreshTargets()
    }, [refreshTargets, workingDir])

    const targets = targetsResponse?.targets || EMPTY_TARGETS
    const selectedTargetSet = useMemo(() => new Set(selectedTargets), [selectedTargets])
    const selectedPackageSet = useMemo(() => new Set(selectedPackageIds), [selectedPackageIds])
    const workspaceCounts = useMemo(() => addPrimitiveCounts(apmPackages), [apmPackages])
    const sidebarSection = sidebarSectionForUnit(selectedExportUnit)
    const primitiveUnit = primitiveUnitForSidebar(selectedExportUnit)
    const syncablePackages = useMemo(
        () => apmPackages.filter((pkg) => packageHasUnit(pkg, selectedExportUnit)),
        [apmPackages, selectedExportUnit],
    )
    const syncablePackageIds = useMemo(() => syncablePackages.map((pkg) => pkg.packageId), [syncablePackages])
    const queryText = filter.trim().toLowerCase()
    const filteredSyncablePackages = useMemo(
        () => syncablePackages.filter((pkg) => !queryText || packageSearchHaystack(pkg).includes(queryText)),
        [queryText, syncablePackages],
    )
    const visiblePackageIds = useMemo(
        () => filteredSyncablePackages.map((pkg) => pkg.packageId),
        [filteredSyncablePackages],
    )
    const allVisibleSelected = visiblePackageIds.length > 0
        && visiblePackageIds.every((packageId) => selectedPackageSet.has(packageId))
    const selectedPackages = useMemo(
        () => syncablePackages.filter((pkg) => selectedPackageSet.has(pkg.packageId)),
        [selectedPackageSet, syncablePackages],
    )
    const selectedCounts = useMemo(() => addPrimitiveCounts(selectedPackages), [selectedPackages])
    const selectedPrimitiveSummary = primitiveSummary(selectedCounts, selectedExportUnit)
    const targetStates = useMemo(() => new Map(targets.map((target) => [
        target.id,
        targetAvailability(target, selectedExportUnit, selectedPackages),
    ])), [selectedExportUnit, selectedPackages, targets])
    const availableTargetIds = useMemo(
        () => targets
            .filter((target) => targetStates.get(target.id)?.available)
            .map((target) => target.id),
        [targetStates, targets],
    )
    const availableTargetIdsKey = availableTargetIds.join('|')
    const syncablePackageIdsKey = syncablePackageIds.join('|')
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
    const resultRowsByTarget = useMemo(() => {
        const rows = new Map<ApmSyncTargetId, ApmSyncRunResponse['results']>()
        if (!lastResult || lastResult.exportUnit !== selectedExportUnit) return rows
        for (const row of lastResult.results) {
            const current = rows.get(row.target) || []
            current.push(row)
            rows.set(row.target, current)
        }
        return rows
    }, [lastResult, selectedExportUnit])
    const activeTargetResultByPackage = useMemo(() => {
        const rows = activeTarget ? resultRowsByTarget.get(activeTarget.id) || [] : []
        return new Map(rows.map((row) => [row.packageId, row]))
    }, [activeTarget, resultRowsByTarget])
    const activeTargetCurrentByPackage = useMemo(() => {
        const items = activeTarget?.currentItems || []
        const matchingUnit = items.filter((item) => selectedExportUnit === 'agent-packages' || item.exportUnit === selectedExportUnit)
        return new Map(matchingUnit.map((item) => [item.packageId, item]))
    }, [activeTarget, selectedExportUnit])
    const activeTargetDefinitions = useMemo(() => {
        const definitions = activeTarget?.definitions || []
        return definitions.filter((definition) => (
            selectedExportUnit === 'agent-packages'
            || !definition.exportUnit
            || definition.exportUnit === selectedExportUnit
        ))
    }, [activeTarget, selectedExportUnit])
    const activeTargetDefinitionByPackage = useMemo(() => {
        const map = new Map<string, ApmSyncTargetDefinitionSummary>()
        for (const pkg of selectedPackages) {
            const definition = findDefinitionForPackage(activeTargetDefinitions, pkg)
            if (definition) map.set(pkg.packageId, definition)
        }
        return map
    }, [activeTargetDefinitions, selectedPackages])
    const matchedDefinitionIds = useMemo(
        () => new Set(Array.from(activeTargetDefinitionByPackage.values()).map((definition) => definition.id)),
        [activeTargetDefinitionByPackage],
    )
    const targetOnlyDefinitions = useMemo(
        () => activeTargetDefinitions.filter((definition) => !matchedDefinitionIds.has(definition.id)),
        [activeTargetDefinitions, matchedDefinitionIds],
    )
    const activePushPackageIds = useMemo(() => {
        if (!activeTarget) return []
        return selectedPackages
            .filter((pkg) => syncChoices[`${activeTarget.id}:${pkg.packageId}`] !== 'skip')
            .map((pkg) => pkg.packageId)
    }, [activeTarget, selectedPackages, syncChoices])
    const syncDisabled = running || selectedTargets.length === 0 || !targetsReady || activePushPackageIds.length === 0
    const activeTargetPlanSteps = useMemo(() => {
        if (!activeTarget) return []
        return [
            selectedExportUnit === 'agent-packages'
                ? 'Use the selected package root.'
                : `Build a temp package from ${unitLabel(selectedExportUnit)}.`,
            `${activePushPackageIds.length} Studio item${activePushPackageIds.length === 1 ? '' : 's'} marked Push.`,
            `${toolingStatusLabel} install --target ${activeTarget.id}.`,
            `Write managed project files into ${activeTarget.outputHint}.`,
            modelOmitted ? 'Keep model settings inside Studio Run.' : null,
        ].filter((step): step is string => Boolean(step))
    }, [activePushPackageIds.length, activeTarget, modelOmitted, selectedExportUnit, toolingStatusLabel])

    useEffect(() => {
        setSelectedPackageIds((current) => {
            if (syncablePackageIds.length === 0) {
                return current.length === 0 ? current : []
            }
            const valid = current.filter((packageId) => syncablePackageIds.includes(packageId))
            if (current.length === 0) return syncablePackageIds
            if (valid.length === current.length && valid.every((packageId, index) => packageId === current[index])) {
                return current
            }
            if (valid.length > 0) return valid
            return syncablePackageIds
        })
    }, [syncablePackageIds, syncablePackageIdsKey])

    useEffect(() => {
        setSelectedTargets((current) => {
            const available = new Set(availableTargetIds)
            const currentActive = current.find((id) => available.has(id))
            if (currentActive) return current.length === 1 && current[0] === currentActive ? current : [currentActive]
            const next = availableTargetIds[0] ? [availableTargetIds[0]] : []
            return next.length === current.length && next.every((id, index) => id === current[index])
                ? current
                : next
        })
    }, [availableTargetIds, availableTargetIdsKey])

    const runSync = useCallback(async () => {
        if (selectedTargets.length === 0 || activePushPackageIds.length === 0) return
        setRunning(true)
        setError(null)
        setLastResult(null)
        try {
            const response = await api.apm.syncTarget({
                targets: selectedTargets,
                packageIds: activePushPackageIds,
                exportUnit: selectedExportUnit,
            })
            setLastResult(response)
            await refetchPackages()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sync failed.')
        } finally {
            setRunning(false)
        }
    }, [activePushPackageIds, refetchPackages, selectedExportUnit, selectedTargets])

    const setPackageSyncChoice = (packageId: string, choice: TargetSyncChoice) => {
        if (!activeTarget) return
        setSyncChoices((current) => ({
            ...current,
            [`${activeTarget.id}:${packageId}`]: choice,
        }))
    }

    const selectTarget = (targetId: ApmSyncTargetId) => {
        if (!targetStates.get(targetId)?.available) return
        setSelectedTargets([targetId])
    }

    const togglePackage = (packageId: string) => {
        setSelectedPackageIds((current) => {
            if (current.includes(packageId)) {
                return current.filter((id) => id !== packageId)
            }
            return [...current, packageId]
        })
    }

    const toggleVisiblePackages = () => {
        setSelectedPackageIds((current) => (
            allVisibleSelected
                ? current.filter((packageId) => !visiblePackageIds.includes(packageId))
                : Array.from(new Set([...current, ...visiblePackageIds]))
        ))
    }

    const headerActions = useMemo(() => (
        <>
            <button className="btn" type="button" onClick={() => void refreshTargets()} disabled={loadingTargets || running}>
                <RefreshCcw size={13} />
                Refresh
            </button>
            <button className="btn btn--primary" type="button" onClick={() => void runSync()} disabled={syncDisabled}>
                <RotateCw size={13} />
                {running ? 'Syncing' : 'Sync'}
            </button>
        </>
    ), [loadingTargets, refreshTargets, runSync, running, syncDisabled])
    const headerConfig = useMemo(() => ({
        title: 'Sync to targets',
        subtitle: workingDir || 'No workspace selected',
        actions: headerActions,
    }), [headerActions, workingDir])

    useAppHeader(headerConfig)

    return (
        <main className="target-export-page">
            {error ? (
                <div className="alert alert--danger target-export-page__alert" role="alert">
                    {error}
                </div>
            ) : null}

            {!targetsReady && targetsResponse ? (
                <div className="alert alert--muted target-export-page__alert">
                    Current target selection cannot receive the selected Studio unit.
                </div>
            ) : null}

            <div className="target-export-layout">
                <section className="surface-card target-export-source" aria-label="Studio source">
                    <div className="target-export-section-header">
                        <div>
                            <div className="target-export-panel-title">
                                <PackageOpen size={15} />
                                <h2>APM Studio</h2>
                            </div>
                            <p>{unitSourcePath(selectedExportUnit)}</p>
                        </div>
                        <span className="badge badge--subtle">{unitLabel(selectedExportUnit)}</span>
                    </div>

                    <div className="target-export-source-controls">
                        <div className="target-export-source-scope" role="tablist" aria-label="Export source unit">
                            <button
                                className={`target-export-scope-btn ${sidebarSection === 'packages' ? 'is-active' : ''}`}
                                type="button"
                                aria-selected={sidebarSection === 'packages'}
                                role="tab"
                                onClick={() => {
                                    setSelectedExportUnit('agent-packages')
                                    setLastResult(null)
                                }}
                            >
                                <PackageOpen size={11} />
                                Packages
                            </button>
                            <button
                                className={`target-export-scope-btn ${sidebarSection === 'primitives' ? 'is-active' : ''}`}
                                type="button"
                                aria-selected={sidebarSection === 'primitives'}
                                role="tab"
                                onClick={() => {
                                    setSelectedExportUnit(primitiveUnit)
                                    setLastResult(null)
                                }}
                            >
                                <Layers3 size={11} />
                                Primitives
                            </button>
                        </div>

                        {sidebarSection === 'primitives' ? (
                            <div className="target-export-primitive-tabs" role="tablist" aria-label="Primitive unit">
                                {(['agents', 'instructions', 'skills', 'mcp'] as PrimitiveExportUnit[]).map((unit) => (
                                    <button
                                        key={unit}
                                        type="button"
                                        className={`target-export-primitive-tab ${selectedExportUnit === unit ? 'is-active' : ''}`}
                                        aria-selected={selectedExportUnit === unit}
                                        role="tab"
                                        onClick={() => {
                                            setSelectedExportUnit(unit)
                                            setLastResult(null)
                                        }}
                                    >
                                        {unit === 'agents' ? <Bot size={10} /> : null}
                                        {unit === 'instructions' ? <FileText size={10} /> : null}
                                        {unit === 'skills' ? <Zap size={10} /> : null}
                                        {unit === 'mcp' ? <Server size={10} /> : null}
                                        {unitLabel(unit)}
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        <div className="target-export-source-toolbar">
                            <label className="target-export-search">
                                <Search size={12} className="icon-muted" />
                                <input
                                    className="text-input"
                                    value={filter}
                                    onChange={(event) => setFilter(event.target.value)}
                                    placeholder="package, primitive, apm.yml path..."
                                />
                            </label>
                            <button
                                className="text-btn"
                                type="button"
                                onClick={toggleVisiblePackages}
                                disabled={visiblePackageIds.length === 0 || running}
                            >
                                {allVisibleSelected ? (filter ? 'Clear visible' : 'Clear') : (filter ? 'Select visible' : 'Select all')}
                            </button>
                        </div>
                    </div>

                    <div className="target-export-source__summary">
                        <strong>{selectedPackageIds.length} selected</strong>
                        <span>{selectedPrimitiveSummary}</span>
                        <span>{apmPackages.length} packages · {primitiveSummary(workspaceCounts)}</span>
                        {packageWarnings > 0 ? <span>{packageWarnings} warnings</span> : null}
                    </div>

                    <div className="target-export-selected-list">
                        {filteredSyncablePackages.map((pkg) => {
                            const counts = primitiveCounts(pkg)
                            const readiness = packageReadiness(pkg, selectedExportUnit)
                            const parts = primitiveCountParts(counts)
                            const selected = selectedPackageSet.has(pkg.packageId)
                            return (
                                <button
                                    key={pkg.packageId}
                                    type="button"
                                    className={`target-export-selected-chip ${selected ? 'is-selected' : ''}`}
                                    title={pkg.description || pkg.manifestPath}
                                    onClick={() => togglePackage(pkg.packageId)}
                                    disabled={running}
                                >
                                    <span className="target-export-selected-chip__title">
                                        {packageIcon(pkg, selectedExportUnit)}
                                        <strong>{pkg.agentName || pkg.name}</strong>
                                        <span className={`target-export-state-pill ${selected ? 'is-ready' : readiness.label === 'Ready' ? 'is-ready' : 'is-warning'}`}>
                                            {selected ? 'Selected' : readiness.label}
                                        </span>
                                    </span>
                                    <span>
                                        {parts.length > 0 ? parts.map((part) => (
                                            <span key={part} className="badge badge--subtle">{part}</span>
                                        )) : <span className="badge badge--subtle">empty</span>}
                                        {pkg.agentComponents?.model ? <span className="badge badge--subtle">model: Run only</span> : null}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {filteredSyncablePackages.length === 0 && !apmPackagesLoading ? (
                        <div className="target-export-empty">
                            No local package contains {unitLabel(selectedExportUnit)}.
                        </div>
                    ) : null}
                </section>

                <aside className="surface-card target-export-preview" aria-label="Targets">
                    <div className="target-export-section-header">
                        <div>
                            <div className="target-export-panel-title">
                                <CheckCircle2 size={15} />
                                <h2>Targets</h2>
                            </div>
                            <p>{toolingStatusLabel}</p>
                        </div>
                        <span className="badge badge--subtle">{activeTarget?.label || 'No target'}</span>
                    </div>

                    <div className="target-export-target-tabs" role="tablist" aria-label="Sync target">
                        {targets.map((target) => {
                            const availability = targetStates.get(target.id) || { available: false, reason: 'Target unavailable.' }
                            return (
                                <button
                                    key={target.id}
                                    type="button"
                                    className={`target-export-target-tab ${activeTarget?.id === target.id ? 'is-active' : ''}`}
                                    aria-selected={activeTarget?.id === target.id}
                                    role="tab"
                                    disabled={!availability.available}
                                    title={availability.reason || target.description}
                                    onClick={() => selectTarget(target.id)}
                                >
                                    <strong>{target.label}</strong>
                                    <span>{availability.available ? target.outputHint : 'Unsupported'}</span>
                                </button>
                            )
                        })}
                    </div>

                    {activeTarget ? (
                        <>
                            <div className="target-export-source__summary target-export-target-summary">
                                <strong>{activePushPackageIds.length} push</strong>
                                <span>{activeTarget.outputHint}</span>
                                <span>{activeTargetDefinitions.length} target definition{activeTargetDefinitions.length === 1 ? '' : 's'}</span>
                            </div>

                            {!activeTargetAvailability?.available ? (
                                <div className="target-export-blocked target-export-blocked--panel">
                                    <AlertTriangle size={14} />
                                    <span>{activeTargetAvailability?.reason}</span>
                                </div>
                            ) : null}

                            <div className="target-export-selected-list target-export-target-list">
                                {selectedPackages.map((pkg) => {
                                    const counts = primitiveCounts(pkg)
                                    const parts = primitiveCountParts(counts)
                                    const availability = targetPackageAvailability(activeTarget, selectedExportUnit, pkg)
                                    const result = activeTargetResultByPackage.get(pkg.packageId)
                                    const currentItem = activeTargetCurrentByPackage.get(pkg.packageId)
                                    const definition = activeTargetDefinitionByPackage.get(pkg.packageId)
                                    const syncChoice = syncChoices[`${activeTarget.id}:${pkg.packageId}`] || 'push'
                                    const status = result?.status || (definition ? 'Matched' : currentItem ? 'Current' : availability.available ? 'New' : 'Blocked')
                                    const stateClass = result?.status === 'failed' || result?.status === 'skipped' || !availability.available
                                        ? 'is-warning'
                                        : 'is-ready'
                                    const detail = result?.error
                                        || result?.artifacts?.[0]
                                        || result?.warnings?.[0]
                                        || definition?.path
                                        || currentItem?.artifacts[0]
                                        || availability.reason
                                        || activeTarget.outputHint

                                    return (
                                        <article
                                            key={`${activeTarget.id}:${pkg.packageId}`}
                                            className="target-export-selected-chip target-export-target-item"
                                            title={detail}
                                        >
                                            <span className="target-export-selected-chip__title">
                                                {packageIcon(pkg, selectedExportUnit)}
                                                <strong>{pkg.agentName || pkg.name}</strong>
                                                <span className={`target-export-state-pill ${stateClass}`}>
                                                    {status}
                                                </span>
                                            </span>
                                            <span>
                                                {parts.length > 0 ? parts.map((part) => (
                                                    <span key={part} className="badge badge--subtle">{part}</span>
                                                )) : <span className="badge badge--subtle">empty</span>}
                                                {definition ? <span className="badge badge--subtle">{definition.kind}</span> : null}
                                                {definition?.managed ? <span className="badge badge--subtle">managed</span> : null}
                                                {result?.projectedAs ? <span className="badge badge--subtle">{result.projectedAs}</span> : null}
                                                {currentItem ? <span className="badge badge--subtle">{currentItem.artifactCount} current</span> : null}
                                                {result?.modelOmitted || pkg.agentComponents?.model ? <span className="badge badge--subtle">model: Run only</span> : null}
                                            </span>
                                            <small>{detail}</small>
                                            <span className="target-export-sync-choice" aria-label={`${pkg.agentName || pkg.name} sync action`}>
                                                <button
                                                    type="button"
                                                    className={`target-export-choice-btn ${syncChoice === 'push' ? 'is-active' : ''}`}
                                                    onClick={() => setPackageSyncChoice(pkg.packageId, 'push')}
                                                    disabled={!availability.available || running}
                                                >
                                                    Push
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`target-export-choice-btn ${syncChoice === 'skip' ? 'is-active' : ''}`}
                                                    onClick={() => setPackageSyncChoice(pkg.packageId, 'skip')}
                                                    disabled={running}
                                                >
                                                    Skip
                                                </button>
                                            </span>
                                        </article>
                                    )
                                })}
                                {targetOnlyDefinitions.map((definition) => (
                                    <article
                                        key={definition.id}
                                        className="target-export-selected-chip target-export-target-item"
                                        title={definition.path}
                                    >
                                        <span className="target-export-selected-chip__title">
                                            <PackageOpen size={12} className="asset-icon combo" />
                                            <strong>{definition.name}</strong>
                                            <span className="target-export-state-pill is-ready">Keep</span>
                                        </span>
                                        <span>
                                            <span className="badge badge--subtle">{definition.kind}</span>
                                            {definition.exportUnit ? <span className="badge badge--subtle">{unitLabel(definition.exportUnit)}</span> : null}
                                            {definition.managed ? <span className="badge badge--subtle">managed</span> : null}
                                        </span>
                                        <small>{definition.path}</small>
                                        <span className="target-export-sync-choice">
                                            <button type="button" className="target-export-choice-btn is-active" disabled>
                                                Keep
                                            </button>
                                        </span>
                                    </article>
                                ))}
                            </div>

                            {selectedPackages.length === 0 && targetOnlyDefinitions.length === 0 ? (
                                <div className="target-export-empty">
                                    Select source packages to preview this target.
                                </div>
                            ) : null}

                            {activeTargetAvailability?.available ? (
                                <ol className="target-export-sync-steps target-export-sync-plan">
                                    {activeTargetPlanSteps.map((step) => <li key={step}>{step}</li>)}
                                </ol>
                            ) : null}
                        </>
                    ) : (
                        <div className="target-export-empty">
                            Select a target to preview sync.
                        </div>
                    )}
                </aside>
            </div>
        </main>
    )
}
