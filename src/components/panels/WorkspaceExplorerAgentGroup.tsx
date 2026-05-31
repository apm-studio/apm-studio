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
import type { AgentEditorFocus, WorkspaceExplorerEditingTarget } from './workspace-explorer-types'

type Props = {
    row: ThreadRow
    showThreads: boolean
    expanded: boolean
    pendingDelete: string | null
    renamingSession: ExplorerRenamingSession
    editingTarget: WorkspaceExplorerEditingTarget
    onToggleExpanded: () => void
    onSetPendingDelete: (key: string | null) => void
    onBeginRenameAgentSession: (session: { id: string; title?: string; sidebarTitle?: string }) => void
    onCommitRenameSession: () => void | Promise<void>
    onCancelRenameSession: () => void
    onSetRenamingValue: (value: string) => void
    agentSessionLabel: (session: { id: string; title?: string; sidebarTitle?: string }) => string
    onOpenAgent: (agentId: string) => void
    onOpenAgentSession: (agentId: string, session: { id: string; title?: string; sidebarTitle?: string }) => void | Promise<void>
    onDeleteSession: (id: string) => void
    onToggleAgentVisibility: (id: string) => void
    onOpenAgentEditor: (id: string, focus: AgentEditorFocus) => void
    onSetActiveChatAgent: (id: string | null) => void
    onRemoveAgent: (id: string) => void
    onSaveAgentAsDraft: (id: string) => void
    onStartNewSession: (agentId: string) => void
}

export default function WorkspaceExplorerAgentGroup({
    row,
    showThreads,
    expanded,
    pendingDelete,
    renamingSession,
    editingTarget,
    onToggleExpanded,
    onSetPendingDelete,
    onBeginRenameAgentSession,
    onCommitRenameSession,
    onCancelRenameSession,
    onSetRenamingValue,
    agentSessionLabel,
    onOpenAgent,
    onOpenAgentSession,
    onDeleteSession,
    onToggleAgentVisibility,
    onOpenAgentEditor,
    onSetActiveChatAgent,
    onRemoveAgent,
    onSaveAgentAsDraft,
    onStartNewSession,
}: Props) {
    const rowKey = `agent-${row.id}`
    const [showAll, setShowAll] = useState(false)
    const viewMode = useStudioStore((s) => s.viewMode)
    const dragDisabled = viewMode === 'full'
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `workspace-node:agent:${row.id}`,
        disabled: dragDisabled,
        data: {
            kind: 'agent',
            source: 'workspace-node',
            nodeId: row.id,
            nodeType: 'agent',
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
                        renaming={renamingSession?.key === `agent:${entry.session.id}` ? renamingSession : null}
                        display={agentSessionLabel(entry.session)}
                        onChange={onSetRenamingValue}
                        onCommit={() => void onCommitRenameSession()}
                        onCancel={onCancelRenameSession}
                    />
                )}
                meta={entry.active ? 'Current thread' : entry.children.length > 0 ? 'Subagent thread' : 'Saved thread'}
                metaTone={entry.active ? 'success' : 'default'}
                active={false}
                onClick={renamingSession?.key === `agent:${entry.session.id}` ? undefined : () => void onOpenAgentSession(row.id, entry.session)}
                actions={(
                    <SessionRowActions
                        renaming={renamingSession?.key === `agent:${entry.session.id}` ? renamingSession : null}
                        onCommit={() => void onCommitRenameSession()}
                        onCancel={onCancelRenameSession}
                        onRename={() => onBeginRenameAgentSession(entry.session)}
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
                onClick={() => onOpenAgent(row.id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenAgent(row.id)
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
                                    onRemoveAgent(row.id)
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
                                onClick={() => onToggleAgentVisibility(row.id)}
                                title={row.hidden ? 'Show Studio Agent' : 'Hide Studio Agent'}
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
                                className={`icon-btn ${(editingTarget?.type === 'agent' && editingTarget.id === row.id) ? 'icon-btn--active' : ''}`}
                                onClick={() => {
                                    onOpenAgentEditor(row.id, 'agent-runtime')
                                    onSetActiveChatAgent(row.id)
                                }}
                                title="Edit Studio Agent"
                            >
                                <Pencil size={11} />
                            </button>
                            <button
                                className="icon-btn"
                                onClick={() => {
                                    onSaveAgentAsDraft(row.id)
                                    showToast(`Saved "${row.label}" as draft`, 'success', {
                                        title: 'Draft saved',
                                        dedupeKey: `draft:save:${row.id}`,
                                    })
                                }}
                                title="Save Studio Agent as draft"
                            >
                                <Archive size={11} />
                            </button>
                            <button
                                className="icon-btn remove-btn"
                                onClick={() => onSetPendingDelete(rowKey)}
                                title="Delete Studio Agent"
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
