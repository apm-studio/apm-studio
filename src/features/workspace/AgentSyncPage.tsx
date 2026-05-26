import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCcw, RotateCw, Trash2 } from 'lucide-react'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import type {
    AgentSyncOverview,
    AgentSyncPerformerStatus,
    AgentSyncProviderSummary,
    AgentSyncStatus,
} from '../../../shared/agent-sync-contracts'
import './AgentSyncPage.css'

const STATUS_ORDER: AgentSyncStatus[] = ['synced', 'stale', 'unsupported', 'invalid', 'failed']

function modelLabel(row: AgentSyncPerformerStatus) {
    if (!row.model) {
        return 'No model'
    }
    return `${row.model.provider}/${row.model.modelId}`
}

function statusLabel(status: AgentSyncStatus) {
    if (status === 'synced') return 'Synced'
    if (status === 'stale') return 'Stale'
    if (status === 'unsupported') return 'Unsupported'
    if (status === 'invalid') return 'Invalid'
    return 'Failed'
}

function checkedLabel(provider: AgentSyncProviderSummary) {
    if (!provider.lastCheckedAt) {
        return 'Not checked'
    }
    return new Date(provider.lastCheckedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    })
}

function providerStatusTotal(provider: AgentSyncProviderSummary) {
    return STATUS_ORDER.reduce((total, status) => total + provider.statusCounts[status], 0)
}

export function AgentSyncPage() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const [overview, setOverview] = useState<AgentSyncOverview | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [runningAction, setRunningAction] = useState<string | null>(null)

    const codexProvider = overview?.providers.find((provider) => provider.id === 'codex') || null
    const rows = useMemo(
        () => (overview?.performers || []).filter((row) => row.providerId === 'codex'),
        [overview],
    )

    const refresh = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setOverview(await api.agentSync.overview())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load Agent Sync status.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void refresh()
    }, [refresh, workingDir])

    const runAction = async (key: string, action: () => Promise<unknown>) => {
        setRunningAction(key)
        setError(null)
        try {
            await action()
            await refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Agent Sync action failed.')
        } finally {
            setRunningAction(null)
        }
    }

    const syncAll = () => runAction('sync-all', () => api.agentSync.sync('codex'))
    const pruneStale = () => runAction('prune', () => api.agentSync.prune('codex'))
    const syncRow = (performerId: string) => runAction(`sync:${performerId}`, () => (
        api.agentSync.sync('codex', { performerIds: [performerId] })
    ))

    const actionBusy = runningAction !== null
    const pruneDisabled = !codexProvider || codexProvider.staleArtifactsCount === 0 || actionBusy
    const syncAllDisabled = rows.length === 0 || actionBusy || rows.every((row) => row.status === 'unsupported' || row.status === 'invalid')
    const providerTotals = useMemo(() => {
        const counts = codexProvider?.statusCounts
        return {
            total: codexProvider ? providerStatusTotal(codexProvider) : 0,
            synced: counts?.synced || 0,
            stale: counts?.stale || 0,
            blocked: (counts?.unsupported || 0) + (counts?.invalid || 0),
            failed: counts?.failed || 0,
            staleArtifacts: codexProvider?.staleArtifactsCount || 0,
            syncable: rows.filter((row) => row.status !== 'unsupported' && row.status !== 'invalid').length,
        }
    }, [codexProvider, rows])

    return (
        <main className="agent-sync-page">
            <header className="agent-sync-page__header">
                <div className="agent-sync-page__title-block">
                    <span className="section-title">Sync</span>
                    <h1>Codex export queue</h1>
                    <p title={workingDir || undefined}>{workingDir || 'No workspace selected'}</p>
                </div>
                <div className="agent-sync-page__actions">
                    <button className="btn" type="button" onClick={() => void refresh()} disabled={loading || actionBusy}>
                        <RefreshCcw size={13} />
                        Refresh
                    </button>
                    <button className="btn" type="button" onClick={pruneStale} disabled={pruneDisabled}>
                        <Trash2 size={13} />
                        Prune Stale
                    </button>
                    <button className="btn btn--primary" type="button" onClick={syncAll} disabled={syncAllDisabled}>
                        <RotateCw size={13} />
                        Sync All
                    </button>
                </div>
            </header>

            {error ? (
                <div className="alert alert--danger agent-sync-page__alert" role="alert">
                    {error}
                </div>
            ) : null}

            <section className="agent-sync-page__summary" aria-label="Codex sync summary">
                <article className="surface-card agent-sync-summary-card agent-sync-summary-card--primary">
                    <div className="agent-sync-summary-card__header">
                        <span className="badge badge--subtle">{codexProvider?.label || 'Codex'}</span>
                        <span className="badge badge--subtle">Checked {codexProvider ? checkedLabel(codexProvider) : 'not yet'}</span>
                    </div>
                    <div className="agent-sync-summary-card__body">
                        <h2>{loading && !overview ? 'Checking export state...' : `${providerTotals.syncable} exportable agents`}</h2>
                        <p>{codexProvider?.available === false ? 'Codex sync is unavailable for this workspace.' : 'Manual sync writes Codex-owned agent and skill artifacts from saved local packages.'}</p>
                    </div>
                </article>
                <div className="agent-sync-stat-grid">
                    <div className="surface-card agent-sync-stat-card">
                        <CheckCircle2 size={14} />
                        <span>Synced</span>
                        <strong>{providerTotals.synced}</strong>
                    </div>
                    <div className="surface-card agent-sync-stat-card agent-sync-stat-card--warning">
                        <RotateCw size={14} />
                        <span>Needs Sync</span>
                        <strong>{providerTotals.stale}</strong>
                    </div>
                    <div className="surface-card agent-sync-stat-card agent-sync-stat-card--warning">
                        <Trash2 size={14} />
                        <span>Stale Files</span>
                        <strong>{providerTotals.staleArtifacts}</strong>
                    </div>
                    <div className="surface-card agent-sync-stat-card agent-sync-stat-card--danger">
                        <AlertTriangle size={14} />
                        <span>Blocked</span>
                        <strong>{providerTotals.blocked + providerTotals.failed}</strong>
                    </div>
                </div>
            </section>

            <section className="surface-card agent-sync-table-card">
                <div className="agent-sync-table-card__header">
                    <div>
                        <h2>Agents</h2>
                        <p>{providerTotals.total} saved package{providerTotals.total === 1 ? '' : 's'} checked for Codex export.</p>
                    </div>
                    {runningAction ? <span className="badge badge--subtle">Working...</span> : null}
                </div>

                <div className="agent-sync-table" role="table" aria-label="Codex assistant sync status">
                    <div className="agent-sync-table__row agent-sync-table__row--head" role="row">
                        <span role="columnheader">Agent</span>
                        <span role="columnheader">State</span>
                        <span role="columnheader">Package</span>
                        <span role="columnheader">Reason</span>
                        <span role="columnheader">Action</span>
                    </div>
                    {rows.map((row) => {
                        const disabled = actionBusy || row.status === 'unsupported' || row.status === 'invalid'
                        return (
                            <div key={`${row.providerId}:${row.performerId}`} className="agent-sync-table__row" role="row">
                                <span role="cell" className="agent-sync-table__performer" title={row.performerName}>
                                    <strong>{row.performerName}</strong>
                                    <small title={modelLabel(row)}>{modelLabel(row)}</small>
                                </span>
                                <span role="cell">
                                    <span className={`agent-sync-status-badge agent-sync-status-badge--${row.status}`}>
                                        {statusLabel(row.status)}
                                    </span>
                                </span>
                                <span role="cell" className="agent-sync-table__muted" title={row.agentName || undefined}>
                                    {row.agentName || '--'}
                                </span>
                                <span role="cell" className="agent-sync-table__reason" title={row.reason}>
                                    {row.reason}
                                </span>
                                <span role="cell" className="agent-sync-table__action">
                                    <button
                                        className="btn btn--sm"
                                        type="button"
                                        onClick={() => syncRow(row.performerId)}
                                        disabled={disabled}
                                    >
                                        <RotateCw size={11} />
                                        {runningAction === `sync:${row.performerId}` ? 'Syncing' : 'Sync'}
                                    </button>
                                </span>
                            </div>
                        )
                    })}
                </div>

                {rows.length === 0 && !loading ? (
                    <div className="agent-sync-table-card__empty">
                        No saved APM agent packages are available for Codex sync.
                    </div>
                ) : null}
            </section>
        </main>
    )
}
