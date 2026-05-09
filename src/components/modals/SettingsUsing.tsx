import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, BarChart2, Zap } from 'lucide-react'
import { api } from '../../api'

type DailyEntry = {
    date: string
    inputTokens: number
    outputTokens: number
    requests: number
}

type ModelEntry = {
    modelId: string
    inputTokens: number
    outputTokens: number
    requests: number
}

type UsageData = {
    studio: { sessionCount: number }
    codex: {
        daily: DailyEntry[]
        byModel: ModelEntry[]
        totalInputTokens: number
        totalOutputTokens: number
        totalRequests: number
        error?: string
    } | null
    error?: string
}

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="using-stat-card">
            <div className="using-stat-card__value">{value}</div>
            <div className="using-stat-card__label">{label}</div>
            {sub && <div className="using-stat-card__sub">{sub}</div>}
        </div>
    )
}

function MiniBar({ value, max }: { value: number; max: number }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0
    return (
        <div className="using-bar-bg">
            <div className="using-bar-fill" style={{ width: `${pct}%` }} />
        </div>
    )
}

export default function SettingsUsing() {
    const [data, setData] = useState<UsageData | null>(null)
    const [loading, setLoading] = useState(true)
    const [fetchError, setFetchError] = useState<string | null>(null)

    async function load() {
        setLoading(true)
        setFetchError(null)
        try {
            const result = await api.usage.get()
            setData(result)
        } catch (err) {
            setFetchError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    const maxDailyRequests = data?.codex
        ? Math.max(...(data.codex.daily.map((d) => d.requests)), 1)
        : 1

    return (
        <div className="stg-panel">
            <div className="stg-panel__header stg-panel__header--split">
                <h2 className="stg-panel__title">Usage</h2>
                <button
                    className="icon-btn"
                    onClick={() => { void load() }}
                    disabled={loading}
                    aria-label="Refresh usage"
                >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {fetchError && (
                <div className="alert alert--danger" style={{ marginBottom: 16 }}>
                    {fetchError}
                </div>
            )}

            {loading && !data ? (
                <div className="empty-state">Loading usage data…</div>
            ) : (
                <>
                    {/* dot-studio stats */}
                    <div className="stg-section">
                        <h3 className="stg-section__title">
                            <Zap size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                            dot-studio
                        </h3>
                        <div className="stg-group">
                            <div className="stg-row">
                                <div className="stg-row__text">
                                    <span className="stg-row__title">Total sessions</span>
                                    <span className="stg-row__desc">Chat sessions created in this workspace</span>
                                </div>
                                <span className="using-badge">{data?.studio.sessionCount ?? 0}</span>
                            </div>
                        </div>
                    </div>

                    {/* OpenAI Codex usage */}
                    <div className="stg-section">
                        <h3 className="stg-section__title">
                            <BarChart2 size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                            OpenAI — Last 30 days
                        </h3>

                        {data?.error === 'no_openai_key' ? (
                            <div className="using-notice">
                                <AlertCircle size={14} />
                                <span>Connect your OpenAI provider to see usage data.</span>
                            </div>
                        ) : data?.codex?.error === 'insufficient_permissions' ? (
                            <div className="using-notice">
                                <AlertCircle size={14} />
                                <span>
                                    Usage data requires an Admin-level API key.
                                    Generate one in your OpenAI dashboard and reconnect the provider.
                                </span>
                            </div>
                        ) : data?.codex?.error ? (
                            <div className="using-notice using-notice--danger">
                                <AlertCircle size={14} />
                                <span>Could not fetch usage: {data.codex.error}</span>
                            </div>
                        ) : data?.codex ? (
                            <>
                                <div className="using-stat-row">
                                    <StatCard
                                        label="Total requests"
                                        value={formatTokens(data.codex.totalRequests)}
                                    />
                                    <StatCard
                                        label="Input tokens"
                                        value={formatTokens(data.codex.totalInputTokens)}
                                    />
                                    <StatCard
                                        label="Output tokens"
                                        value={formatTokens(data.codex.totalOutputTokens)}
                                    />
                                </div>

                                {data.codex.byModel.length > 0 && (
                                    <div className="stg-group" style={{ marginTop: 16 }}>
                                        <div className="stg-row" style={{ paddingBottom: 6, paddingTop: 6 }}>
                                            <span className="stg-row__desc" style={{ fontWeight: 600 }}>Model</span>
                                            <span className="stg-row__desc" style={{ fontWeight: 600, minWidth: 80, textAlign: 'right' }}>Requests</span>
                                        </div>
                                        {data.codex.byModel.map((m) => (
                                            <div key={m.modelId} className="stg-row">
                                                <div className="stg-row__text">
                                                    <span className="stg-row__title" style={{ fontSize: 12 }}>{m.modelId}</span>
                                                    <span className="stg-row__desc">
                                                        {formatTokens(m.inputTokens)} in · {formatTokens(m.outputTokens)} out
                                                    </span>
                                                </div>
                                                <span className="using-badge">{m.requests.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {data.codex.daily.length > 0 && (
                                    <>
                                        <h3 className="stg-section__title" style={{ marginTop: 20 }}>Daily requests</h3>
                                        <div className="stg-group">
                                            {[...data.codex.daily].reverse().slice(0, 14).map((d) => (
                                                <div key={d.date} className="stg-row using-day-row">
                                                    <span className="using-day-label">{d.date.slice(5)}</span>
                                                    <div className="using-day-bar">
                                                        <MiniBar value={d.requests} max={maxDailyRequests} />
                                                    </div>
                                                    <span className="using-day-count">{d.requests.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {data.codex.totalRequests === 0 && (
                                    <div className="using-notice">
                                        <span>No usage in the last 30 days.</span>
                                    </div>
                                )}
                            </>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    )
}
