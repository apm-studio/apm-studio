/**
 * SettingsModels — Connected model browser.
 * Shows all available connected models grouped by provider (read-only).
 */

import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { opencodeApi } from '../../api-clients/opencode'
import { buildRuntimeModelProviderGroups } from '../../lib/runtime-models'
import type { RuntimeModelVariant } from '../../../shared/model-variants'

type ModelEntry = {
    id: string
    name: string
    provider: string
    providerName: string
    toolCall: boolean
    reasoning: boolean
    attachment: boolean
    connected: boolean
    context: number
    variants: RuntimeModelVariant[]
}

interface ProviderGroup {
    providerId: string
    providerName: string
    models: ModelEntry[]
}

function modelBadges(model: ModelEntry) {
    return [
        model.toolCall ? 'Tools' : null,
        model.reasoning ? 'Reasoning' : null,
        model.attachment ? 'Files' : null,
        model.variants.length > 0 ? `${model.variants.length} variants` : null,
    ].filter((badge): badge is string => Boolean(badge))
}

export default function SettingsModels() {
    const [models, setModels] = useState<ModelEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')

    useEffect(() => {
        let cancelled = false
        async function load() {
            setLoading(true)
            try {
                const list = await opencodeApi.models.list()
                if (cancelled) return
                const entries: ModelEntry[] = (list || []).map((m) => ({
                    id: m.id,
                    name: m.name || m.id,
                    provider: m.provider,
                    providerName: m.providerName || m.provider,
                    toolCall: !!m.toolCall,
                    reasoning: !!m.reasoning,
                    attachment: !!m.attachment,
                    connected: !!m.connected,
                    context: Number(m.context || 0),
                    variants: m.variants || [],
                }))
                setModels(entries)
            } catch {
                // ignore
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [])

    const groups = useMemo(() => {
        return buildRuntimeModelProviderGroups(models, {
            query,
            connectedOnly: true,
        }).map((group): ProviderGroup => ({
            providerId: group.providerId,
            providerName: group.providerName,
            models: group.models,
        }))
    }, [models, query])

    return (
        <div className="stg-panel">
            <div className="stg-panel__header">
                <h2 className="stg-panel__title">Models</h2>
            </div>

            <div className="search-input-container" style={{ marginBottom: 16 }}>
                <Search size={14} className="search-input-container__icon" />
                <input
                    className="search-input-container__input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search models…"
                    spellCheck={false}
                    autoComplete="off"
                />
                {query && (
                    <button className="icon-btn" onClick={() => setQuery('')}>
                        <X size={12} />
                    </button>
                )}
            </div>

            {loading ? (
                <div className="empty-state">Loading models…</div>
            ) : groups.length === 0 ? (
                <div className="empty-state">
                    {query ? `No models matching "${query}"` : 'No connected models available.'}
                </div>
            ) : (
                <div className="stg-models-list">
                    {groups.map((group) => (
                        <details key={group.providerId} className="stg-section stg-details">
                            <summary>{group.providerName} · {group.models.length}</summary>
                            <div className="stg-group">
                                {group.models.map((model) => {
                                    const key = `${model.provider}:${model.id}`
                                    const badges = modelBadges(model)
                                    const title = [
                                        model.id,
                                        model.context ? `${model.context.toLocaleString()} context` : null,
                                    ].filter(Boolean).join(' · ')
                                    return (
                                        <div key={key} className="stg-row" title={title}>
                                            <div className="stg-row__text">
                                                <span className="stg-row__title">{model.name}</span>
                                                {badges.length > 0 ? (
                                                    <span className="stg-model-badges">
                                                        {badges.map((badge) => (
                                                            <span key={badge} className="badge badge--subtle">{badge}</span>
                                                        ))}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </details>
                    ))}
                </div>
            )}
        </div>
    )
}
