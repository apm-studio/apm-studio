import type { ChatMessage } from '../../store/session/chat-message-types'
import { useCallback, useRef, useState } from 'react'
import { MessageSquare, Workflow } from 'lucide-react'
import type { ExplorerRenamingSession, ThreadRow } from './workspace-explorer-utils'
import { resolveTeamThreadActivityAt, resolveSessionActivityAt } from './workspace-explorer-utils'
import type { AgentEditorFocus, WorkspaceExplorerTeam, WorkspaceExplorerTeamThread, WorkspaceExplorerEditingTarget } from './workspace-explorer-types'

import type { SessionEntity } from '../../store/session'
import WorkspaceExplorerTeamGroup from './WorkspaceExplorerTeamGroup'
import WorkspaceExplorerAgentGroup from './WorkspaceExplorerAgentGroup'

export type WorkspaceExplorerThreadsSectionProps = {
    workspaceId: string | null
    teams: WorkspaceExplorerTeam[]
    showThreads: boolean
    threadRows: ThreadRow[]
    expandedRows: Record<string, boolean>
    pendingDelete: string | null
    renamingSession: ExplorerRenamingSession
    editingTarget: WorkspaceExplorerEditingTarget
    selectedTeamId: string | null
    activeThreadId: string | null
    teamThreads: Record<string, WorkspaceExplorerTeamThread[]>
    sessions: Array<{ id: string; title?: string; sidebarTitle?: string; createdAt?: number; updatedAt?: number }>
    seEntities: Record<string, SessionEntity>
    seMessages: Record<string, ChatMessage[]>
    onToggleExpanded: (key: string) => void
    onSetPendingDelete: (key: string | null) => void
    onBeginRenameAgentSession: (session: { id: string; title?: string; sidebarTitle?: string }) => void
    onCommitRenameSession: () => void | Promise<void>
    onCancelRenameSession: () => void
    onSetRenamingValue: (value: string) => void
    agentSessionLabel: (session: { id: string; title?: string; sidebarTitle?: string }) => string
    onOpenAgent: (agentId: string) => void
    onOpenAgentSession: (agentId: string, session: { id: string; title?: string; sidebarTitle?: string }) => void | Promise<void>
    onDeleteSession: (id: string) => void
    onAddAgent: () => void
    onAddTeam: () => void
    onToggleAgentVisibility: (id: string) => void
    onOpenAgentEditor: (id: string, focus: AgentEditorFocus) => void
    onSetActiveChatAgent: (id: string | null) => void
    onRemoveAgent: (id: string) => void
    onSaveAgentAsDraft: (id: string) => void
    onOpenTeam: (id: string) => void
    onCreateThread: (id: string) => void | Promise<void>

    onSaveTeamAsDraft: (id: string) => void
    onToggleTeamVisibility: (id: string) => void
    onRemoveTeam: (id: string) => void
    onSelectThread: (teamId: string, threadId: string) => void
    onDeleteThread: (teamId: string, threadId: string) => void
    onRenameThread: (teamId: string, threadId: string, name: string) => void
    onStartNewSession: (agentId: string) => void
    onOpenTeamEditor: (teamId: string) => void
}

export default function WorkspaceExplorerThreadsSection({
    workspaceId,
    teams,
    showThreads,
    threadRows,
    expandedRows,
    pendingDelete,
    renamingSession,
    editingTarget,
    selectedTeamId,
    activeThreadId,
    teamThreads,
    sessions,
    seEntities,
    seMessages,
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
    onAddAgent,
    onAddTeam,
    onToggleAgentVisibility,
    onOpenAgentEditor,
    onSetActiveChatAgent,
    onRemoveAgent,
    onSaveAgentAsDraft,
    onOpenTeam,
    onCreateThread,

    onSaveTeamAsDraft,
    onToggleTeamVisibility,
    onRemoveTeam,
    onSelectThread,
    onDeleteThread,
    onRenameThread,
    onStartNewSession,
    onOpenTeamEditor,
}: WorkspaceExplorerThreadsSectionProps) {
    const hasAgents = threadRows.length > 0
    const hasTeams = teams.length > 0
    const sessionActivityById = Object.fromEntries(
        sessions.map((session) => {
            const entity = seEntities[session.id]
            const latestMessageTimestamp = (seMessages[session.id] || []).reduce(
                (latest, message) => Math.max(latest, message.timestamp || 0),
                0,
            )
            return [session.id, resolveSessionActivityAt({
                createdAt: Math.max(session.createdAt || 0, entity?.createdAt || 0),
                updatedAt: Math.max(session.updatedAt || 0, entity?.updatedAt || 0),
            }, latestMessageTimestamp)]
        }),
    )

    // ── Resizable divider between Agents and Teams ──
    const [agentsFlex, setAgentsFlex] = useState(1)
    const containerRef = useRef<HTMLDivElement>(null)
    const dividerDragging = useRef(false)

    const suppressNextClick = useCallback(() => {
        const handleClickCapture = (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            document.removeEventListener('click', handleClickCapture, true)
        }

        document.addEventListener('click', handleClickCapture, true)
        window.setTimeout(() => {
            document.removeEventListener('click', handleClickCapture, true)
        }, 0)
    }, [])

    const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dividerDragging.current = true
        const container = containerRef.current
        if (!container) return

        const startY = e.clientY
        const containerRect = container.getBoundingClientRect()
        const totalHeight = containerRect.height
        const startFlex = agentsFlex

        const onMove = (ev: MouseEvent) => {
            if (!dividerDragging.current) return
            const delta = ev.clientY - startY
            const ratio = delta / totalHeight
            // Flex range: 0.15 to 0.85 (each side gets at least 15% of the space)
            setAgentsFlex(Math.min(5, Math.max(0.2, startFlex + ratio * 2)))
        }
        const onUp = (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            dividerDragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            suppressNextClick()
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
    }, [agentsFlex, suppressNextClick])

    return (
        <section className="explorer-section explorer-section--threads" ref={containerRef}>
            {/* ── Agents Pane ── */}
            <div className="explorer__pane" style={{ flex: agentsFlex }}>
                <div className="explorer__subheader explorer__subheader--inline">
                    <span className="explorer__title">Agents</span>
                    <div className="explorer__actions">
                        <button className="icon-btn" onClick={onAddAgent} title="Add agent" disabled={!workspaceId}>
                            <MessageSquare size={12} />
                        </button>
                    </div>
                </div>
                <div className="explorer__pane-scroll scroll-area">
                    {hasAgents ? (
                        <div className="explorer__section-list">
                            {threadRows.map((row) => {
                                const rowKey = `agent-${row.id}`
                                const isExpanded = showThreads && (expandedRows[rowKey] ?? row.children.length > 0)
                                return (
                                    <WorkspaceExplorerAgentGroup
                                        key={rowKey}
                                        row={row}
                                        showThreads={showThreads}
                                        expanded={isExpanded}
                                        pendingDelete={pendingDelete}
                                        renamingSession={renamingSession}
                                        editingTarget={editingTarget}
                                        onToggleExpanded={() => onToggleExpanded(rowKey)}
                                        onSetPendingDelete={onSetPendingDelete}
                                        onBeginRenameAgentSession={onBeginRenameAgentSession}
                                        onCommitRenameSession={onCommitRenameSession}
                                        onCancelRenameSession={onCancelRenameSession}
                                        onSetRenamingValue={onSetRenamingValue}
                                        agentSessionLabel={agentSessionLabel}
                                        onOpenAgent={onOpenAgent}
                                        onOpenAgentSession={onOpenAgentSession}
                                        onDeleteSession={onDeleteSession}
                                        onToggleAgentVisibility={onToggleAgentVisibility}
                                        onOpenAgentEditor={onOpenAgentEditor}
                                        onSetActiveChatAgent={onSetActiveChatAgent}
                                        onRemoveAgent={onRemoveAgent}
                                        onSaveAgentAsDraft={onSaveAgentAsDraft}
                                        onStartNewSession={onStartNewSession}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No agents yet
                        </div>
                    )}
                </div>
            </div>

            {/* ── Divider ── */}
            <div className="explorer__divider" onMouseDown={onDividerMouseDown} />

            {/* ── Teams Pane ── */}
            <div className="explorer__pane" style={{ flex: 1 }}>
                <div className="explorer__subheader explorer__subheader--inline">
                    <span className="explorer__title">
                        Teams
                    </span>
                    <div className="explorer__actions">
                        <button className="icon-btn" onClick={onAddTeam} title="Add Team" disabled={!workspaceId}>
                            <Workflow size={12} />
                        </button>
                    </div>
                </div>
                <div className="explorer__pane-scroll scroll-area">
                    {hasTeams ? (
                        <div className="explorer__section-list">
                            {teams.map((team) => {
                                const teamKey = `team-${team.id}`
                                const threads = showThreads ? [...(teamThreads[team.id] || [])].sort(
                                    (left, right) => (
                                        resolveTeamThreadActivityAt(right, sessionActivityById)
                                        - resolveTeamThreadActivityAt(left, sessionActivityById)
                                    ) || ((right.createdAt || 0) - (left.createdAt || 0)),
                                ) : []
                                const isExpanded = showThreads && (expandedRows[teamKey] ?? threads.length > 0)
                                return (
                                    <WorkspaceExplorerTeamGroup
                                        key={teamKey}
                                        team={team}
                                        showThreads={showThreads}
                                        selectedTeamId={selectedTeamId}
                                        activeThreadId={activeThreadId}
                                        threads={threads}
                                        expanded={isExpanded}
                                        pendingDelete={pendingDelete}
                                        onToggleExpanded={onToggleExpanded}
                                        onOpenTeam={onOpenTeam}
                                        onCreateThread={onCreateThread}
                                        onSetPendingDelete={onSetPendingDelete}
                                        onSaveTeamAsDraft={onSaveTeamAsDraft}
                                        onToggleTeamVisibility={onToggleTeamVisibility}
                                        onRemoveTeam={onRemoveTeam}
                                        onSelectThread={onSelectThread}
                                        onDeleteThread={onDeleteThread}
                                        onRenameThread={onRenameThread}
                                        onOpenTeamEditor={onOpenTeamEditor}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        <div className="empty-state empty-state--tight empty-state--nested">
                            No teams yet
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
