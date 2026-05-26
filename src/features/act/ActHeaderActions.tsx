import { EyeOff, Maximize2, Minimize2, Pencil, X } from 'lucide-react'
import type { ActReadinessResult } from './act-readiness'
import './ActHeaderActions.css'

type ActHeaderActionsProps = {
    focused: boolean
    splitPane?: boolean
    editing: boolean
    readiness?: ActReadinessResult
    onToggleFocus: () => void
    onRemoveSplitPane?: () => void
    onToggleEdit: () => void
    onHide: () => void
}

function readinessBadgeClass(readiness?: ActReadinessResult): string {
    if (!readiness) return ''
    if (!readiness.runnable) return 'act-frame__readiness-roster--error'
    if (readiness.issues.length > 0) return 'act-frame__readiness-roster--warning'
    return 'act-frame__readiness-roster--ok'
}

function readinessTitle(readiness?: ActReadinessResult): string {
    if (!readiness) return ''
    if (!readiness.runnable) {
        const first = readiness.issues.find((i) => i.severity === 'error')
        return first ? first.message : 'Team is not runnable'
    }
    if (readiness.issues.length > 0) return 'Runnable with warnings'
    return 'Ready to run'
}

export default function ActHeaderActions({
    focused,
    splitPane = false,
    editing,
    readiness,
    onToggleFocus,
    onRemoveSplitPane,
    onToggleEdit,
    onHide,
}: ActHeaderActionsProps) {
    const fullscreenSurface = focused || splitPane

    return (
        <div className="act-frame__header-actions">
            {!fullscreenSurface && readiness && (
                <span
                    className={`act-frame__readiness-dot ${readinessBadgeClass(readiness)}`}
                    title={readinessTitle(readiness)}
                />
            )}
            {splitPane ? (
                <button
                    className="icon-btn act-frame__focus-btn"
                    title="Remove from Split View"
                    onClick={(event) => {
                        event.stopPropagation()
                        onRemoveSplitPane?.()
                    }}
                >
                    <X size={11} />
                </button>
            ) : (
                <button
                    className={`icon-btn act-frame__focus-btn ${focused ? 'active' : ''}`}
                    title={focused ? 'Exit focus mode' : 'Focus mode'}
                    onClick={(event) => {
                        event.stopPropagation()
                        onToggleFocus()
                    }}
                >
                    {focused ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                </button>
            )}
            {!fullscreenSurface && (
                <>
                    <button
                        className={`icon-btn act-frame__edit-btn ${editing ? 'active' : ''}`}
                        title={editing ? 'Exit edit mode' : 'Edit Team'}
                        onClick={(event) => {
                            event.stopPropagation()
                            onToggleEdit()
                        }}
                    >
                        {editing ? <X size={11} /> : <Pencil size={11} />}
                    </button>
                    <button
                        className="icon-btn act-frame__close-btn"
                        title="Hide Team"
                        onClick={(event) => {
                            event.stopPropagation()
                            onHide()
                        }}
                    >
                        <EyeOff size={11} />
                    </button>
                </>
            )}
        </div>
    )
}
