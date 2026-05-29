import { AlertCircle, Settings, Sparkles } from 'lucide-react'

export function AssistantEmptyPrompt() {
    return (
        <div className="assistant-empty">
            <Sparkles size={48} className="assistant-empty__icon" />
            <h3 className="assistant-empty__title">How can I help you design?</h3>
            <p className="assistant-empty__desc">
                Ask me to package agents, apply them to assistants, or explain how APM Studio works.
            </p>
        </div>
    )
}

export function AssistantModelMissingState({ onOpenSettings }: { onOpenSettings: () => void }) {
    return (
        <div className="assistant-content">
            <div className="assistant-empty">
                <AlertCircle size={40} className="assistant-empty__icon assistant-empty__icon--warn" />
                <h3 className="assistant-empty__title">Model not configured</h3>
                <p className="assistant-empty__desc">
                    To use APM Assistant, configure at least one AI model provider first.
                </p>
                <button className="assistant-setup-btn" onClick={onOpenSettings}>
                    <Settings size={14} />
                    <span>Open Settings</span>
                </button>
            </div>
        </div>
    )
}
