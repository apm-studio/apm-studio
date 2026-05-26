import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, RefreshCcw, RotateCw, Trash2 } from 'lucide-react'
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
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)
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
            setError(err instanceof Error ? err.message : 'Unable to load Assistant Sync status.')
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
            setError(err instanceof Error ? err.message : 'Assistant Sync action failed.')
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

    return (
        <main className="agent-sync-page">
            <header className="agent-sync-page__header">
                <div className="agent-sync-page__title-block">
                    <h1>Assistant Sync</h1>
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
                    <button className="btn" type="button" onClick={() => setWorkspaceMode('canvas')}>
                        <ArrowLeft size={13} />
                        Back to Canvas
                    </button>
                </div>
            </header>

            {error ? (
                <div className="alert alert--danger agent-sync-page__alert" role="alert">
                    {error}
                </div>
            ) : null}

            <section className="agent-sync-page__providers" aria-label="Assistant sync providers">
                {overview?.providers.map((provider) => (
                    <article key={provider.id} className="surface-card agent-sync-provider-card">
                        <div className="agent-sync-provider-card__header">
                            <div>
                                <h2>{provider.label}</h2>
                                <p>{provider.available ? `${providerStatusTotal(provider)} agents` : 'Unavailable'}</p>
                            </div>
                            <span className="badge badge--subtle">Checked {checkedLabel(provider)}</span>
                        </div>
                        <div className="agent-sync-provider-card__counts">
                            {STATUS_ORDER.map((status) => (
                                <span key={status} className={`agent-sync-status-count agent-sync-status-count--${status}`}>
                                    {statusLabel(status)}
                                    <strong>{provider.statusCounts[status]}</strong>
                                </span>
                            ))}
                            <span className="agent-sync-status-count agent-sync-status-count--stale-artifacts">
                                Stale artifacts
                                <strong>{provider.staleArtifactsCount}</strong>
                            </span>
                        </div>
                    </article>
                ))}
                {!overview && loading ? (
                    <div className="surface-card agent-sync-provider-card agent-sync-provider-card--placeholder">
                        Loading provider status…
                    </div>
                ) : null}
            </section>

            <section className="surface-card agent-sync-table-card">
                <div className="agent-sync-table-card__header">
                    <div>
                        <h2>Codex Agents</h2>
                        <p>Manual export status for Codex project agents.</p>
                    </div>
                    {runningAction ? <span className="badge badge--subtle">Working...</span> : null}
                </div>

                <div className="agent-sync-table" role="table" aria-label="Codex assistant sync status">
                    <div className="agent-sync-table__row agent-sync-table__row--head" role="row">
                        <span role="columnheader">Agent</span>
                        <span role="columnheader">Model</span>
                        <span role="columnheader">Status</span>
                        <span role="columnheader">Reason</span>
                        <span role="columnheader">Agent</span>
                        <span role="columnheader">Action</span>
                    </div>
                    {rows.map((row) => {
                        const disabled = actionBusy || row.status === 'unsupported' || row.status === 'invalid'
                        return (
                            <div key={`${row.providerId}:${row.performerId}`} className="agent-sync-table__row" role="row">
                                <span role="cell" className="agent-sync-table__performer" title={row.performerName}>
                                    {row.performerName}
                                </span>
                                <span role="cell" className="agent-sync-table__muted" title={modelLabel(row)}>
                                    {modelLabel(row)}
                                </span>
                                <span role="cell">
                                    <span className={`agent-sync-status-badge agent-sync-status-badge--${row.status}`}>
                                        {statusLabel(row.status)}
                                    </span>
                                </span>
                                <span role="cell" className="agent-sync-table__reason" title={row.reason}>
                                    {row.reason}
                                </span>
                                <span role="cell" className="agent-sync-table__muted" title={row.agentName || undefined}>
                                    {row.agentName || '--'}
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
                        No saved agents are available for Codex sync.
                    </div>
                ) : null}
            </section>
        </main>
    )
}
