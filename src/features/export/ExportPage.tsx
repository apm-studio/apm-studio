import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, PackageOpen, RefreshCcw, RotateCw, Terminal } from 'lucide-react'
import { api } from '../../api'
import { useAppHeader } from '../../components/AppHeaderContext'
import { useApmPackages } from '../../hooks/queries'
import { useStudioStore } from '../../store'
import type {
    ApmPackageSummary,
    ApmSyncRunResponse,
    ApmSyncTargetId,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-contracts'
import './ExportPage.css'

function apmPrimitiveLabel(pkg: ApmPackageSummary) {
    const counts = pkg.microsoftApm?.primitiveCounts
    if (!counts) {
        return '0 primitives'
    }
    return `${counts.agents} agents · ${counts.instructions} instructions · ${counts.skills} skills`
}

function apmReadiness(pkg: ApmPackageSummary) {
    const warnings = pkg.microsoftApm?.warnings || []
    return warnings.length > 0
        ? { label: 'Needs attention', title: warnings.join('\n') }
        : { label: 'Ready', title: 'Microsoft APM source primitives are available.' }
}

function resultSummary(result: ApmSyncRunResponse | null) {
    if (!result) return null
    const synced = result.results.filter((row) => row.status === 'synced').length
    const failed = result.results.filter((row) => row.status === 'failed').length
    return `${synced} exported · ${failed} failed`
}

export function ExportPage() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const [targetsResponse, setTargetsResponse] = useState<ApmSyncTargetsResponse | null>(null)
    const [selectedTargets, setSelectedTargets] = useState<ApmSyncTargetId[]>(['codex'])
    const [loadingTargets, setLoadingTargets] = useState(false)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [lastResult, setLastResult] = useState<ApmSyncRunResponse | null>(null)
    const { data: apmPackages = [], isLoading: apmPackagesLoading, refetch: refetchPackages } = useApmPackages()

    const refreshTargets = useCallback(async () => {
        setLoadingTargets(true)
        setError(null)
        try {
            const response = await api.apm.syncTargets()
            setTargetsResponse(response)
            setSelectedTargets((current) => {
                const valid = current.filter((id) => response.targets.some((target) => target.id === id))
                return valid.length > 0 ? valid : [response.targets[0]?.id || 'codex']
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load APM export targets.')
        } finally {
            setLoadingTargets(false)
        }
    }, [])

    useEffect(() => {
        void refreshTargets()
    }, [refreshTargets, workingDir])

    const targets = targetsResponse?.targets || []
    const selectedTargetSet = useMemo(() => new Set(selectedTargets), [selectedTargets])
    const activeTargets = targets.filter((target) => selectedTargetSet.has(target.id))
    const apmCliAvailable = activeTargets.length > 0 && activeTargets.every((target) => target.available)
    const syncablePackages = useMemo(
        () => apmPackages.filter((pkg) => (pkg.microsoftApm?.primitiveCounts.agents || 0)
            + (pkg.microsoftApm?.primitiveCounts.instructions || 0)
            + (pkg.microsoftApm?.primitiveCounts.skills || 0) > 0),
        [apmPackages],
    )
    const packageWarnings = apmPackages.reduce((total, pkg) => total + (pkg.microsoftApm?.warnings.length || 0), 0)
    const syncDisabled = running || selectedTargets.length === 0 || !apmCliAvailable || syncablePackages.length === 0

    const runSync = useCallback(async () => {
        if (selectedTargets.length === 0) return
        setRunning(true)
        setError(null)
        setLastResult(null)
        try {
            const response = await api.apm.syncTarget({
                targets: selectedTargets,
                packageIds: syncablePackages.map((pkg) => pkg.packageId),
            })
            setLastResult(response)
            await refetchPackages()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'APM target export failed.')
        } finally {
            setRunning(false)
        }
    }, [refetchPackages, selectedTargets, syncablePackages])

    const toggleTarget = (targetId: ApmSyncTargetId) => {
        setSelectedTargets((current) => {
            if (current.includes(targetId)) {
                return current.filter((id) => id !== targetId)
            }
            return [...current, targetId]
        })
    }

    const selectedTargetLabel = activeTargets.length === 1
        ? activeTargets[0].label
        : `${activeTargets.length || selectedTargets.length} targets`
    const selectedTargetDescription = activeTargets.length === 1
        ? activeTargets[0].description
        : `Export packages into ${activeTargets.map((target) => target.label).join(', ') || 'selected APM targets'}.`
    const toolingCommand = targetsResponse?.tooling.recommendedCommand
    const toolingStatusLabel = loadingTargets || !targetsResponse
        ? 'Checking...'
        : apmCliAvailable
            ? toolingCommand === 'apm'
                ? 'Ready via apm'
                : 'Ready via uvx'
            : 'Tooling missing'
    const headerActions = useMemo(() => (
        <>
            <button className="btn" type="button" onClick={() => void refreshTargets()} disabled={loadingTargets || running}>
                <RefreshCcw size={13} />
                Refresh
            </button>
            <button className="btn btn--primary" type="button" onClick={() => void runSync()} disabled={syncDisabled}>
                <RotateCw size={13} />
                {running ? 'Exporting' : 'Export Targets'}
            </button>
        </>
    ), [loadingTargets, refreshTargets, runSync, running, syncDisabled])
    const headerConfig = useMemo(() => ({
        title: 'APM target export',
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

            {!apmCliAvailable && targetsResponse ? (
                <div className="alert alert--muted target-export-page__alert">
                    Microsoft APM CLI tooling is required for target export. Install the <code>apm</code> command or make <code>uvx --from apm-cli apm</code> available.
                </div>
            ) : null}

            <section className="target-export-page__summary" aria-label="APM target export summary">
                <article className="surface-card target-export-summary-card target-export-summary-card--primary">
                    <div className="target-export-summary-card__header">
                        <span className="badge badge--subtle">{selectedTargetLabel}</span>
                        <span className="badge badge--subtle">{toolingStatusLabel}</span>
                    </div>
                    <div className="target-export-summary-card__body">
                        <h2>{syncablePackages.length} exportable package{syncablePackages.length === 1 ? '' : 's'}</h2>
                        <p>{selectedTargetDescription}</p>
                    </div>
                </article>
                <div className="target-export-stat-grid">
                    <div className="surface-card target-export-stat-card">
                        <PackageOpen size={14} />
                        <span>Packages</span>
                        <strong>{apmPackages.length}</strong>
                    </div>
                    <div className="surface-card target-export-stat-card">
                        <CheckCircle2 size={14} />
                        <span>Ready</span>
                        <strong>{syncablePackages.length}</strong>
                    </div>
                    <div className={`surface-card target-export-stat-card ${packageWarnings > 0 ? 'target-export-stat-card--warning' : ''}`}>
                        <AlertTriangle size={14} />
                        <span>Warnings</span>
                        <strong>{packageWarnings}</strong>
                    </div>
                    <div className="surface-card target-export-stat-card">
                        <RotateCw size={14} />
                        <span>Last Export</span>
                        <strong>{resultSummary(lastResult) || '--'}</strong>
                    </div>
                </div>
            </section>

            <div className="target-export-page__grid">
                <section className="surface-card target-export-table-card">
                    <div className="target-export-table-card__header">
                        <div>
                            <h2>Packages</h2>
                            <p>{apmPackages.length} local APM package{apmPackages.length === 1 ? '' : 's'} will export through <code>apm install --target</code>.</p>
                        </div>
                        {running ? <span className="badge badge--subtle">Working...</span> : null}
                    </div>

                    <div className="target-export-table" role="table" aria-label="APM package target export status">
                        <div className="target-export-table__row target-export-table__row--head" role="row">
                            <span role="columnheader">Package</span>
                            <span role="columnheader">State</span>
                            <span role="columnheader">Root</span>
                            <span role="columnheader">APM source</span>
                            <span role="columnheader">Result</span>
                        </div>
                        {apmPackages.map((pkg) => {
                            const readiness = apmReadiness(pkg)
                            const packageResults = lastResult?.results.filter((row) => row.packageId === pkg.packageId) || []
                            const failedResult = packageResults.find((row) => row.status === 'failed')
                            const resultTitle = packageResults.map((row) => `${row.target}: ${row.error || row.command}`).join('\n')
                            const resultLabel = packageResults.length === 0
                                ? '--'
                                : `${packageResults.filter((row) => row.status === 'synced').length}/${packageResults.length} exported`
                            return (
                                <div key={pkg.packageId} className="target-export-table__row" role="row">
                                    <span role="cell" className="target-export-table__performer" title={pkg.agentName || pkg.name}>
                                        <strong>{pkg.agentName || pkg.name}</strong>
                                        <small>{pkg.kind}</small>
                                    </span>
                                    <span role="cell">
                                        <span className={`target-export-status-badge target-export-status-badge--${readiness.label === 'Ready' ? 'synced' : 'stale'}`} title={readiness.title}>
                                            {readiness.label}
                                        </span>
                                    </span>
                                    <span role="cell" className="target-export-table__muted" title={pkg.microsoftApm?.packageRoot}>
                                        {pkg.microsoftApm?.packageRoot || '--'}
                                    </span>
                                    <span role="cell" className="target-export-table__reason" title={apmPrimitiveLabel(pkg)}>
                                        {apmPrimitiveLabel(pkg)}
                                    </span>
                                    <span role="cell" className="target-export-table__reason" title={resultTitle || undefined}>
                                        {failedResult ? 'failed' : resultLabel}
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    {apmPackages.length === 0 && !apmPackagesLoading ? (
                        <div className="target-export-table-card__empty">
                            No local APM packages are available yet.
                        </div>
                    ) : null}
                </section>

                <aside className="target-export-page__side">
                    <section className="surface-card target-export-side-card" aria-label="APM export targets">
                        <div className="target-export-side-card__header">
                            <h2>Targets</h2>
                            <span className="badge badge--subtle">{loadingTargets ? 'Checking...' : `${targets.length} targets`}</span>
                        </div>
                        <div className="target-export-target-list">
                            {targets.map((target) => (
                                <button
                                    key={target.id}
                                    type="button"
                                    className={`list-row target-export-target-row ${selectedTargetSet.has(target.id) ? 'is-active' : ''}`}
                                    aria-pressed={selectedTargetSet.has(target.id)}
                                    onClick={() => toggleTarget(target.id)}
                                >
                                    <div>
                                        <strong>{target.label}</strong>
                                        <span>{target.commandPreview}</span>
                                    </div>
                                    <span className="badge badge--subtle">{target.available ? 'Ready' : 'Missing CLI'}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="surface-card target-export-side-card" aria-label="APM deployment tooling">
                        <div className="target-export-side-card__header">
                            <h2>APM Tooling</h2>
                            <span className="badge badge--subtle">{toolingStatusLabel}</span>
                        </div>
                        <p>{targetsResponse?.tooling.deploymentNote || 'APM Studio detects Microsoft APM CLI as an external tool.'}</p>
                        {targetsResponse?.tooling.recommendedCommand ? (
                            <code title={targetsResponse.tooling.recommendedCommand}>
                                <Terminal size={12} />
                                {targetsResponse.tooling.recommendedCommand}
                            </code>
                        ) : null}
                    </section>
                </aside>
            </div>
        </main>
    )
}
