import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
    Archive,
    Check,
    ChevronRight,
    Eye,
    EyeOff,
    MessageSquare,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react'
import { showToast } from '../../lib/toast'
import { useStudioStore } from '../../store'
import {
    LayerRow,
    SessionNameEditor,
    SessionRowActions,
    type ExplorerRenamingSession,
    type ThreadRow,
} from './workspace-explorer-utils'
import type { PerformerEditorFocus, WorkspaceExplorerEditingTarget } from './workspace-explorer-types'

type Props = {
    row: ThreadRow
    showThreads: boolean
    expanded: boolean
    pendingDelete: string | null
    renamingSession: ExplorerRenamingSession
    editingTarget: WorkspaceExplorerEditingTarget
    onToggleExpanded: () => void
    onSetPendingDelete: (key: string | null) => void
    onBeginRenamePerformerSession: (session: { id: string; title?: string; sidebarTitle?: string }) => void
    onCommitRenameSession: () => void | Promise<void>
    onCancelRenameSession: () => void
    onSetRenamingValue: (value: string) => void
    performerSessionLabel: (session: { id: string; title?: string; sidebarTitle?: string }) => string
    onOpenPerformer: (performerId: string) => void
    onOpenPerformerSession: (performerId: string, session: { id: string; title?: string; sidebarTitle?: string }) => void | Promise<void>
    onDeleteSession: (id: string) => void
    onTogglePerformerVisibility: (id: string) => void
    onOpenPerformerEditor: (id: string, focus: PerformerEditorFocus) => void
    onSetActiveChatPerformer: (id: string | null) => void
    onRemovePerformer: (id: string) => void
    onSavePerformerAsDraft: (id: string) => void
    onStartNewSession: (performerId: string) => void
}

export default function WorkspaceExplorerPerformerGroup({
    row,
    showThreads,
    expanded,
    pendingDelete,
    renamingSession,
    editingTarget,
    onToggleExpanded,
    onSetPendingDelete,
    onBeginRenamePerformerSession,
    onCommitRenameSession,
    onCancelRenameSession,
    onSetRenamingValue,
    performerSessionLabel,
    onOpenPerformer,
    onOpenPerformerSession,
    onDeleteSession,
    onTogglePerformerVisibility,
    onOpenPerformerEditor,
    onSetActiveChatPerformer,
    onRemovePerformer,
    onSavePerformerAsDraft,
    onStartNewSession,
}: Props) {
    const rowKey = `performer-${row.id}`
    const [showAll, setShowAll] = useState(false)
    const viewMode = useStudioStore((s) => s.viewMode)
    const dragDisabled = viewMode === 'full'
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `workspace-node:performer:${row.id}`,
        disabled: dragDisabled,
        data: {
            kind: 'performer',
            source: 'workspace-node',
            nodeId: row.id,
            nodeType: 'performer',
            label: row.label,
            name: row.label,
        },
    })
    const rowAccessibilityProps = dragDisabled
        ? { role: 'button' as const, tabIndex: 0 }
        : attributes
    const THREAD_LIMIT = 5
    const visibleChildren = showAll ? row.children : row.children.slice(0, THREAD_LIMIT)
    const hiddenCount = row.children.length - THREAD_LIMIT

    const renderSessionEntry = (entry: ThreadRow['children'][number]) => (
        <div key={entry.session.id} style={{ marginLeft: `${entry.depth * 14}px` }}>
            <LayerRow
                icon={<MessageSquare size={11} className={entry.active ? 'icon-active' : 'icon-muted'} />}
                label={(
                    <SessionNameEditor
                        renaming={renamingSession?.key === `performer:${entry.session.id}` ? renamingSession : null}
                        display={performerSessionLabel(entry.session)}
                        onChange={onSetRenamingValue}
                        onCommit={() => void onCommitRenameSession()}
                        onCancel={onCancelRenameSession}
                    />
                )}
                meta={entry.active ? 'Current thread' : entry.children.length > 0 ? 'Subagent thread' : 'Saved thread'}
                metaTone={entry.active ? 'success' : 'default'}
                active={false}
                onClick={renamingSession?.key === `performer:${entry.session.id}` ? undefined : () => void onOpenPerformerSession(row.id, entry.session)}
                actions={(
                    <SessionRowActions
                        renaming={renamingSession?.key === `performer:${entry.session.id}` ? renamingSession : null}
                        onCommit={() => void onCommitRenameSession()}
                        onCancel={onCancelRenameSession}
                        onRename={() => onBeginRenamePerformerSession(entry.session)}
                        onDelete={() => onDeleteSession(entry.session.id)}
                        renameTitle="Rename session"
                        deleteTitle="Delete session"
                    />
                )}
            />
            {entry.children.map((child) => renderSessionEntry(child))}
        </div>
    )

    return (
        <div className="thread-group">
            <div
                ref={setNodeRef}
                {...rowAccessibilityProps}
                className={[
                    'thread-card',
                    dragDisabled ? '' : 'thread-card--draggable',
                    row.active ? 'active' : '',
                    row.hidden ? 'muted' : '',
                    isDragging ? 'is-dragging' : '',
                ].filter(Boolean).join(' ')}
                {...(dragDisabled ? {} : listeners)}
                onClick={() => onOpenPerformer(row.id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenPerformer(row.id)
                    }
                }}
            >
                {showThreads ? (
                    <span
                        className={`thread-card__chevron ${expanded ? 'is-open' : ''}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation()
                            onToggleExpanded()
                        }}
                    >
                        <ChevronRight size={12} />
                    </span>
                ) : null}
                <span className="thread-card__icon">
                    <MessageSquare size={13} />
                </span>
                <span className="thread-card__body">
                    <span className="thread-card__name">{row.label}</span>
                </span>
                <span
                    className="thread-card__actions"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {pendingDelete === rowKey ? (
                        <>
                            <span className="thread-card__delete-label">Delete?</span>
                            <button
                                className="icon-btn remove-btn"
                                onClick={() => {
                                    onSetPendingDelete(null)
                                    onRemovePerformer(row.id)
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
                                className={`icon-btn ${row.hidden ? 'visibility-off' : 'visibility-on'}`}
                                onClick={() => onTogglePerformerVisibility(row.id)}
                                title={row.hidden ? 'Show agent' : 'Hide agent'}
                            >
                                {row.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                            {showThreads ? (
                                <button
                                    className="icon-btn"
                                    onClick={() => onStartNewSession(row.id)}
                                    title="New session"
                                >
                                    <Plus size={11} />
                                </button>
                            ) : null}
                            <button
                                className={`icon-btn ${(editingTarget?.type === 'performer' && editingTarget.id === row.id) ? 'icon-btn--active' : ''}`}
                                onClick={() => {
                                    onOpenPerformerEditor(row.id, 'performer-runtime')
                                    onSetActiveChatPerformer(row.id)
                                }}
                                title="Edit agent"
                            >
                                <Pencil size={11} />
                            </button>
                            <button
                                className="icon-btn"
                                onClick={() => {
                                    onSavePerformerAsDraft(row.id)
                                    showToast(`Saved "${row.label}" as draft`, 'success', {
                                        title: 'Draft saved',
                                        dedupeKey: `draft:save:${row.id}`,
                                    })
                                }}
                                title="Save agent as draft"
                            >
                                <Archive size={11} />
                            </button>
                            <button
                                className="icon-btn remove-btn"
                                onClick={() => onSetPendingDelete(rowKey)}
                                title="Delete agent"
                            >
                                <Trash2 size={11} />
                            </button>
                        </>
                    )}
                </span>
            </div>
            {showThreads && expanded ? (
                <div className="thread-children">
                    {row.children.length > 0 ? (
                        <>
                            {visibleChildren.map((entry) => renderSessionEntry(entry))}
                            {hiddenCount > 0 ? (
                                <button
                                    className="show-more-btn"
                                    onClick={(e) => { e.stopPropagation(); setShowAll(!showAll) }}
                                    type="button"
                                >
                                    {showAll ? 'Show less' : `Show ${hiddenCount} more`}
                                </button>
                            ) : null}
                        </>
                    ) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No threads yet
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
