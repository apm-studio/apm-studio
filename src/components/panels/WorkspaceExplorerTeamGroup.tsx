import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
    Archive,
    Check,
    ChevronRight,
    Edit3,
    Eye,
    EyeOff,
    Pencil,
    Plus,
    Trash2,
    Workflow,
    X,
} from 'lucide-react'
import { showToast } from '../../lib/toast'
import type { WorkspaceExplorerTeam, WorkspaceExplorerTeamThread } from './workspace-explorer-types'
import { evaluateTeamReadiness } from '../../features/team/team-readiness'
import { useStudioStore } from '../../store'

type Props = {
    team: WorkspaceExplorerTeam
    showThreads: boolean
    selectedTeamId: string | null
    activeThreadId: string | null
    threads: WorkspaceExplorerTeamThread[]
    expanded: boolean
    pendingDelete: string | null
    onToggleExpanded: (key: string) => void
    onOpenTeam: (id: string) => void
    onCreateThread: (id: string) => void | Promise<void>
    onSetPendingDelete: (key: string | null) => void
    onSaveTeamAsDraft: (id: string) => void
    onToggleTeamVisibility: (id: string) => void
    onRemoveTeam: (id: string) => void
    onSelectThread: (teamId: string, threadId: string) => void
    onDeleteThread: (teamId: string, threadId: string) => void
    onRenameThread: (teamId: string, threadId: string, name: string) => void
    onOpenTeamEditor: (teamId: string) => void
}

export default function WorkspaceExplorerTeamGroup({
    team,
    showThreads,
    selectedTeamId,
    activeThreadId,
    threads,
    expanded,
    pendingDelete,
    onToggleExpanded,
    onOpenTeam,
    onCreateThread,
    onSetPendingDelete,
    onSaveTeamAsDraft,
    onToggleTeamVisibility,
    onRemoveTeam,
    onSelectThread,
    onDeleteThread,
    onRenameThread,
    onOpenTeamEditor,
}: Props) {
    const teamKey = `team-${team.id}`
    const isTeamSelected = selectedTeamId === team.id
    const participantCount = Object.keys(team.participants).length
    const [showAllThreads, setShowAllThreads] = useState(false)
    const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const viewMode = useStudioStore((s) => s.viewMode)
    const dragDisabled = viewMode === 'full'
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `workspace-node:team:${team.id}`,
        disabled: dragDisabled,
        data: {
            kind: 'team',
            source: 'workspace-node',
            nodeId: team.id,
            nodeType: 'team',
            label: team.name,
            name: team.name,
        },
    })
    const rowAccessibilityProps = dragDisabled
        ? { role: 'button' as const, tabIndex: 0 }
        : attributes
    const THREAD_LIMIT = 5
    const visibleThreads = showAllThreads ? threads : threads.slice(0, THREAD_LIMIT)
    const hiddenThreadCount = threads.length - THREAD_LIMIT

    const agents = useStudioStore((s) => s.agents)
    const readiness = evaluateTeamReadiness(team, agents)
    const createThreadTitle = readiness.runnable
        ? 'New Thread'
        : readiness.issues.find((i) => i.severity === 'error')?.message || 'Team is not runnable'

    return (
        <div className="thread-group">
            <div
                ref={setNodeRef}
                {...rowAccessibilityProps}
                className={[
                    'thread-card',
                    dragDisabled ? '' : 'thread-card--draggable',
                    isTeamSelected ? 'active' : '',
                    team.hidden ? 'muted' : '',
                    isDragging ? 'is-dragging' : '',
                ].filter(Boolean).join(' ')}
                {...(dragDisabled ? {} : listeners)}
                onClick={() => onOpenTeam(team.id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenTeam(team.id)
                    }
                }}
            >
                {showThreads ? (
                    <span
                        className={`thread-card__chevron ${expanded ? 'is-open' : ''}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation()
                            onToggleExpanded(teamKey)
                        }}
                    >
                        <ChevronRight size={12} />
                    </span>
                ) : null}
                <span className="thread-card__icon">
                    <Workflow size={13} />
                </span>
                <span className="thread-card__body">
                    <span className="thread-card__name">{team.name}</span>
                    <span className="thread-card__meta">
                        {participantCount}p · {team.relations.length}r{showThreads ? ` · ${threads.length}t` : ''}
                    </span>
                </span>
                {/* Actions keep the same order as the Agent group. */}
                <span
                    className="thread-card__actions"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {pendingDelete === teamKey ? (
                        <>
                            <span className="thread-card__delete-label">Delete?</span>
                            <button
                                className="icon-btn remove-btn"
                                onClick={() => {
                                    onSetPendingDelete(null)
                                    onRemoveTeam(team.id)
                                }}
                                title="Confirm delete"
                            >
                                <Check size={11} />
                            </button>
                            <button
                                className="icon-btn"
                                onClick={() => onSetPendingDelete(null)}
                                title="Cancel delete"
                            >
                                <X size={11} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className={`icon-btn ${team.hidden ? 'visibility-off' : 'visibility-on'}`}
                                onClick={() => onToggleTeamVisibility(team.id)}
                                title={team.hidden ? 'Show on canvas' : 'Hide from canvas'}
                            >
                                {team.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                            {showThreads ? (
                                <button
                                    className="icon-btn"
                                    onClick={() => void onCreateThread(team.id)}
                                    title={createThreadTitle}
                                    disabled={!readiness.runnable}
                                >
                                    <Plus size={11} />
                                </button>
                            ) : null}
                            <button
                                className="icon-btn"
                                onClick={() => onOpenTeamEditor(team.id)}
                                title="Edit team"
                            >
                                <Pencil size={11} />
                            </button>
                            <button
                                className="icon-btn"
                                onClick={() => {
                                    onSaveTeamAsDraft(team.id)
                                    showToast(`Saved "${team.name}" as draft`, 'success', {
                                        title: 'Draft saved',
                                        dedupeKey: `draft:save:team:${team.id}`,
                                    })
                                }}
                                title="Save team as draft"
                            >
                                <Archive size={11} />
                            </button>
                            <button
                                className="icon-btn remove-btn"
                                onClick={() => onSetPendingDelete(teamKey)}
                                title="Delete team"
                            >
                                <Trash2 size={11} />
                            </button>
                        </>
                    )}
                </span>
            </div>
            {showThreads && expanded ? (
                <div className="thread-children">
                    {threads.length > 0 ? (
                        <>
                            {visibleThreads.map((thread) => {
                                const isThreadActive = activeThreadId === thread.id
                                const statusIcon = thread.status === 'active' ? '●' : thread.status === 'completed' ? '✓' : '⏸'
                                const statusClass = `thread-status--${thread.status || 'idle'}`
                                return (
                                    <div
                                        key={thread.id}
                                        role="button"
                                        tabIndex={0}
                                        className="layer-row"
                                        onClick={() => {
                                            onSelectThread(team.id, thread.id)
                                        }}
                                    >
                                        <span className="layer-row__icon">
                                            <Workflow size={11} />
                                        </span>
                                        <span className="layer-row__body">
                                            <span className="layer-row__label">
                                                {renamingThreadId === thread.id ? (
                                                    <input
                                                        className="inline-rename-input"
                                                        value={renameValue}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                onRenameThread(team.id, thread.id, renameValue.trim())
                                                                setRenamingThreadId(null)
                                                            } else if (e.key === 'Escape') {
                                                                setRenamingThreadId(null)
                                                            }
                                                        }}
                                                        onBlur={() => {
                                                            if (renameValue.trim()) {
                                                                onRenameThread(team.id, thread.id, renameValue.trim())
                                                            }
                                                            setRenamingThreadId(null)
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span className="thread-label">
                                                        <span className={`thread-status-dot ${statusClass}`}>{statusIcon}</span>
                                                        {thread.name || `Thread ${thread.id.slice(0, 6)}`}
                                                    </span>
                                                )}
                                            </span>
                                            <span className={`layer-row__meta layer-row__meta--${isThreadActive ? 'success' : 'default'}`}>
                                                {isThreadActive ? 'Current thread' : 'Saved thread'}
                                            </span>
                                        </span>
                                        <span className="layer-row__actions" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="icon-btn"
                                                onClick={() => {
                                                    setRenameValue(thread.name || `Thread ${thread.id.slice(0, 6)}`)
                                                    setRenamingThreadId(thread.id)
                                                }}
                                                title="Rename thread"
                                            >
                                                <Edit3 size={10} />
                                            </button>
                                            <button
                                                className="icon-btn remove-btn"
                                                onClick={() => onDeleteThread(team.id, thread.id)}
                                                title="Delete thread"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </span>
                                    </div>
                                )
                            })}
                            {hiddenThreadCount > 0 ? (
                                <button
                                    className="show-more-btn"
                                    onClick={(e) => { e.stopPropagation(); setShowAllThreads(!showAllThreads) }}
                                    type="button"
                                >
                                    {showAllThreads ? 'Show less' : `Show ${hiddenThreadCount} more`}
                                </button>
                            ) : null}
                        </>
                    ) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No threads — click + to create one
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
