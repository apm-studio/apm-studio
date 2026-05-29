import { EyeOff, Maximize2, Minimize2, Pencil, X } from 'lucide-react'
import type { TeamReadinessResult } from './team-readiness'
import './TeamHeaderActions.css'

type TeamHeaderActionsProps = {
    focused: boolean
    splitPane?: boolean
    editing: boolean
    hideFocusControl?: boolean
    hideEditControl?: boolean
    readiness?: TeamReadinessResult
    onToggleFocus: () => void
    onRemoveSplitPane?: () => void
    onToggleEdit: () => void
    onHide: () => void
}

function readinessBadgeClass(readiness?: TeamReadinessResult): string {
    if (!readiness) return ''
    if (!readiness.runnable) return 'team-frame__readiness-apm--error'
    if (readiness.issues.length > 0) return 'team-frame__readiness-apm--warning'
    return 'team-frame__readiness-apm--ok'
}

function readinessTitle(readiness?: TeamReadinessResult): string {
    if (!readiness) return ''
    if (!readiness.runnable) {
        const first = readiness.issues.find((i) => i.severity === 'error')
        return first ? first.message : 'Team is not runnable'
    }
    if (readiness.issues.length > 0) return 'Runnable with warnings'
    return 'Ready to run'
}

export default function TeamHeaderActions({
    focused,
    splitPane = false,
    editing,
    hideFocusControl = false,
    hideEditControl = false,
    readiness,
    onToggleFocus,
    onRemoveSplitPane,
    onToggleEdit,
    onHide,
}: TeamHeaderActionsProps) {
    const fullscreenSurface = focused || splitPane

    return (
        <div className="team-frame__header-actions">
            {!fullscreenSurface && readiness && (
                <span
                    className={`team-frame__readiness-dot ${readinessBadgeClass(readiness)}`}
                    title={readinessTitle(readiness)}
                />
            )}
            {splitPane ? (
                <button
                    className="icon-btn team-frame__focus-btn"
                    title="Remove from Split View"
                    onClick={(event) => {
                        event.stopPropagation()
                        onRemoveSplitPane?.()
                    }}
                >
                    <X size={11} />
                </button>
            ) : !hideFocusControl ? (
                <button
                    className={`icon-btn team-frame__focus-btn ${focused ? 'active' : ''}`}
                    title={focused ? 'Exit focus mode' : 'Focus mode'}
                    onClick={(event) => {
                        event.stopPropagation()
                        onToggleFocus()
                    }}
                >
                    {focused ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                </button>
            ) : null}
            {!fullscreenSurface && (
                <>
                    {!hideEditControl ? (
                        <button
                            className={`icon-btn team-frame__edit-btn ${editing ? 'active' : ''}`}
                            title={editing ? 'Exit edit mode' : 'Edit Team'}
                            onClick={(event) => {
                                event.stopPropagation()
                                onToggleEdit()
                            }}
                        >
                            {editing ? <X size={11} /> : <Pencil size={11} />}
                        </button>
                    ) : null}
                    <button
                        className="icon-btn team-frame__close-btn"
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
