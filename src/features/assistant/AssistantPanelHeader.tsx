import { RefreshCcw, Sparkles, X } from 'lucide-react'

type AssistantPanelHeaderProps = {
    currentModelLabel: string | null
    statusLabel: string
    isLoading: boolean
    hasModels: boolean
    onRefreshSession: () => void
    onToggleAssistant: () => void
}

export default function AssistantPanelHeader({
    currentModelLabel,
    statusLabel,
    isLoading,
    hasModels,
    onRefreshSession,
    onToggleAssistant,
}: AssistantPanelHeaderProps) {
    return (
        <div className="assistant-header">
            <div className="assistant-header__meta">
                <div className="assistant-header__title">
                    <div className="assistant-header__icon">
                        <Sparkles size={14} />
                    </div>
                    <span>APM Assistant</span>
                </div>
                <div className="assistant-header__subtitle">
                    <span>{currentModelLabel || 'No model selected'}</span>
                    <span className={`assistant-status-pill ${isLoading ? 'is-busy' : ''}`}>{statusLabel}</span>
                </div>
            </div>
            <div className="assistant-header__actions">
                <button
                    className="assistant-sessions__new"
                    onClick={onRefreshSession}
                    title="Refresh session"
                    disabled={!hasModels || isLoading}
                >
                    <RefreshCcw size={13} />
                </button>
                <button
                    className="icon-btn assistant-header__close"
                    onClick={onToggleAssistant}
                    title="Hide APM Assistant"
                >
                    <X size={12} />
                </button>
            </div>
        </div>
    )
}
