import type { MouseEvent } from 'react'
import { Pencil, EyeOff, Maximize2, Minimize2, X } from 'lucide-react'
import AgentFrameHeaderMeta from './AgentFrameHeaderMeta'

type AgentFrameHeaderActionsProps = {
    modelLabel: string | null
    modelTitle: string | null
    instructionLabel: string | null
    skillSummary: string | null
    isFullscreenSurface: boolean
    shouldShowEditPanel: boolean
    isSplitPane: boolean
    isFullView: boolean
    hideFocusControl: boolean
    onRemoveSplitPane: () => void
    onToggleFocus: () => void
    onOpenEditor: () => void
    onToggleVisibility: () => void
}

function stopAndRun(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    event.stopPropagation()
    action()
}

export default function AgentFrameHeaderActions({
    modelLabel,
    modelTitle,
    instructionLabel,
    skillSummary,
    isFullscreenSurface,
    shouldShowEditPanel,
    isSplitPane,
    isFullView,
    hideFocusControl,
    onRemoveSplitPane,
    onToggleFocus,
    onOpenEditor,
    onToggleVisibility,
}: AgentFrameHeaderActionsProps) {
    return (
        <div className="canvas-frame__header-actions">
            {!isFullscreenSurface && (
                <AgentFrameHeaderMeta
                    modelLabel={modelLabel}
                    modelTitle={modelTitle}
                    instructionLabel={instructionLabel}
                    skillSummary={skillSummary}
                />
            )}
            {isSplitPane ? (
                <button
                    className="icon-btn agent-frame__header-action"
                    onClick={(event) => stopAndRun(event, onRemoveSplitPane)}
                    title="Remove from Split View"
                >
                    <X size={11} />
                </button>
            ) : !hideFocusControl ? (
                <button
                    className={`icon-btn agent-frame__header-action ${isFullView ? 'icon-btn--active' : ''}`}
                    onClick={(event) => stopAndRun(event, onToggleFocus)}
                    title={isFullView ? 'Exit focus mode' : 'Focus mode'}
                >
                    {isFullView ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                </button>
            ) : null}
            {!isFullscreenSurface && !shouldShowEditPanel && (
                <button
                    className="icon-btn agent-frame__header-action"
                    onClick={(event) => stopAndRun(event, onOpenEditor)}
                    title="Edit agent"
                >
                    <Pencil size={11} />
                </button>
            )}
            {!isFullscreenSurface && (
                <button
                    className="icon-btn agent-frame__header-action"
                    onClick={(event) => stopAndRun(event, onToggleVisibility)}
                    title="Hide from Canvas"
                >
                    <EyeOff size={11} />
                </button>
            )}
        </div>
    )
}
