import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { chatApi } from '../../api-clients/chat'
import { showToast } from '../../lib/toast'
import {
    getCanvasViewportSize,
    resolveNodeBaselineHidden,
    SPLIT_VIEW_MAX_PANES,
    setFocusSnapshotNodeHidden,
} from '../../lib/focus-utils'
import { useStudioStore } from '../../store'
import { bindExistingSession } from '../../store/session'
import type { FocusSnapshot, FullscreenNodeType, WorkspaceViewMode } from '../../store/workspace/types'
import { parseStudioSessionTitle } from '../../../shared/session-metadata'
import {
    buildAgentSessionRows,
    buildThreadRows,
    groupAgentSessionsById,
    resolveSessionActivityAt,
    type ExplorerRenamingSession,
} from './workspace-explorer-utils'
import type { WorkspaceExplorerThreadsSectionProps } from './WorkspaceExplorerThreadsSection'

interface WorkspaceExplorerThreadsControllerOptions {
    showThreads: boolean
    workingDir: string
}

export function useWorkspaceExplorerThreadsController({
    showThreads,
    workingDir,
}: WorkspaceExplorerThreadsControllerOptions): WorkspaceExplorerThreadsSectionProps {
    const {
        workspaceId,
        agents,
        sessions,
        seEntities,
        seMessages,
        chatKeyToSession,
        editingTarget,
        selectedAgentId,
        selectedAgentSessionId,
        listSessions,
        addAgent,
        selectAgent,
        selectAgentSession,
        setActiveChatAgent,
        openAgentEditor,
        closeEditor,
        deleteSession,
        toggleAgentVisibility,
        removeAgent,
        saveAgentAsDraft,
        saveTeamAsDraft,
    } = useStudioStore(useShallow((state) => ({
        workspaceId: state.workspaceId,
        agents: state.agents,
        sessions: state.sessions,
        seEntities: state.seEntities,
        seMessages: state.seMessages,
        chatKeyToSession: state.chatKeyToSession,
        editingTarget: state.editingTarget,
        selectedAgentId: state.selectedAgentId,
        selectedAgentSessionId: state.selectedAgentSessionId,
        listSessions: state.listSessions,
        addAgent: state.addAgent,
        selectAgent: state.selectAgent,
        selectAgentSession: state.selectAgentSession,
        setActiveChatAgent: state.setActiveChatAgent,
        openAgentEditor: state.openAgentEditor,
        closeEditor: state.closeEditor,
        deleteSession: state.deleteSession,
        toggleAgentVisibility: state.toggleAgentVisibility,
        removeAgent: state.removeAgent,
        saveAgentAsDraft: state.saveAgentAsDraft,
        saveTeamAsDraft: state.saveTeamAsDraft,
    })))

    const teams = useStudioStore((s) => s.teams)
    const selectedTeamId = useStudioStore((s) => s.selectedTeamId)
    const selectTeam = useStudioStore((s) => s.selectTeam)
    const removeTeam = useStudioStore((s) => s.removeTeam)
    const toggleTeamVisibility = useStudioStore((s) => s.toggleTeamVisibility)
    const teamThreads = useStudioStore((s) => s.teamThreads)
    const activeThreadId = useStudioStore((s) => s.activeThreadId)
    const createThread = useStudioStore((s) => s.createThread)
    const selectThread = useStudioStore((s) => s.selectThread)
    const deleteThread = useStudioStore((s) => s.deleteThread)
    const renameThread = useStudioStore((s) => s.renameThread)
    const startNewSession = useStudioStore((s) => s.startNewSession)
    const openTeamEditor = useStudioStore((s) => s.openTeamEditor)
    const focusSnapshot = useStudioStore((s) => s.focusSnapshot)
    const switchFocusTarget = useStudioStore((s) => s.switchFocusTarget)
    const addSplitViewPane = useStudioStore((s) => s.addSplitViewPane)
    const replaceSplitViewPane = useStudioStore((s) => s.replaceSplitViewPane)
    const setSplitViewActivePane = useStudioStore((s) => s.setSplitViewActivePane)
    const revealCanvasNode = useStudioStore((s) => s.revealCanvasNode)

    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
    const [pendingDelete, setPendingDelete] = useState<string | null>(null)
    const [renamingSession, setRenamingSession] = useState<ExplorerRenamingSession>(null)

    useEffect(() => {
        if (!showThreads) return
        listSessions()
    }, [listSessions, showThreads, workingDir])

    const sharedAgents = useMemo(
        () => agents.filter((agent) => agent.scope === 'shared'),
        [agents],
    )

    const agentSessionRows = useMemo(() => {
        if (!showThreads) return []

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

        return buildAgentSessionRows(
            sessions.map((session) => ({
                ...session,
                updatedAt: sessionActivityById[session.id] || session.updatedAt,
            })),
            agents,
            chatKeyToSession,
        )
    }, [chatKeyToSession, agents, seEntities, seMessages, sessions, showThreads])

    const agentSessionsById = useMemo(() => {
        return groupAgentSessionsById(agentSessionRows)
    }, [agentSessionRows])

    const threadRows = useMemo(() => {
        return buildThreadRows({
            sharedAgents,
            editingTarget: editingTarget?.type === 'agent' ? editingTarget : null,
            agentSessionsById,
            focusSnapshot,
            selectedAgentId,
            selectedAgentSessionId,
        })
    }, [editingTarget, focusSnapshot, agentSessionsById, selectedAgentId, selectedAgentSessionId, sharedAgents])

    const visibleTeams = useMemo(() => teams.map((team) => ({
        ...team,
        hidden: resolveNodeBaselineHidden(focusSnapshot, team.id, 'team', !!team.hidden),
    })), [teams, focusSnapshot])

    const toggleExpanded = useCallback((key: string) => {
        setExpandedRows((current) => ({
            ...current,
            [key]: !current[key],
        }))
    }, [])

    const agentSessionLabel = useCallback((session: { id: string; title?: string; sidebarTitle?: string }) => {
        if (session.sidebarTitle?.trim()) {
            return session.sidebarTitle.trim()
        }
        const metadata = parseStudioSessionTitle(session.title)
        return metadata?.label || ('slug' in session && typeof session.slug === 'string' ? session.slug : null) || session.id.slice(0, 8)
    }, [])

    const beginRenameAgentSession = useCallback((session: { id: string; title?: string; sidebarTitle?: string }) => {
        setRenamingSession({
            key: `agent:${session.id}`,
            kind: 'agent',
            sessionId: session.id,
            value: agentSessionLabel(session),
        })
    }, [agentSessionLabel])

    const cancelRenameSession = useCallback(() => {
        setRenamingSession(null)
    }, [])

    const commitRenameSession = useCallback(async () => {
        if (!renamingSession) {
            return
        }

        const nextLabel = renamingSession.value.trim()
        if (!nextLabel) {
            cancelRenameSession()
            return
        }

        try {
            await chatApi.updateSession(renamingSession.sessionId, nextLabel)
            await listSessions()
            setRenamingSession(null)
        } catch (error) {
            console.error('Failed to rename session', error)
            showToast('Studio could not rename that thread.', 'error', {
                title: 'Thread rename failed',
                dedupeKey: `thread:rename:${renamingSession.sessionId}`,
            })
        }
    }, [cancelRenameSession, listSessions, renamingSession])

    const openWorkspaceNodeInCurrentView = useCallback((
        nodeId: string,
        nodeType: FullscreenNodeType,
        currentFocusSnapshot: FocusSnapshot | null,
        currentViewMode: WorkspaceViewMode,
    ) => {
        if (currentViewMode === 'split') {
            const state = useStudioStore.getState()
            const openPane = state.splitView.panes.find((pane) => pane.nodeId === nodeId && pane.type === nodeType)
            if (openPane) {
                setSplitViewActivePane(nodeId, nodeType)
                return
            }

            if (state.splitView.panes.length >= SPLIT_VIEW_MAX_PANES) {
                const replacementPane = state.splitView.panes.find((pane) => pane.paneId === state.splitView.activePaneId)
                    || state.splitView.panes[0]
                if (replacementPane) {
                    replaceSplitViewPane(replacementPane.paneId, nodeId, nodeType, getCanvasViewportSize())
                    return
                }
            }

            addSplitViewPane(nodeId, nodeType, getCanvasViewportSize())
            return
        }

        if (currentViewMode === 'full' && !currentFocusSnapshot) {
            useStudioStore.getState().enterFocusMode(nodeId, nodeType, getCanvasViewportSize())
            return
        }

        const shouldSwitchFocus = Boolean(currentFocusSnapshot && (
            currentFocusSnapshot.nodeId !== nodeId
            || currentFocusSnapshot.type !== nodeType
        ))

        if (shouldSwitchFocus) {
            switchFocusTarget(nodeId, nodeType)
            return
        }

        if (nodeType === 'agent') {
            selectAgent(nodeId)
            return
        }

        selectTeam(nodeId)
    }, [addSplitViewPane, replaceSplitViewPane, selectTeam, selectAgent, setSplitViewActivePane, switchFocusTarget])

    const ensureAgentVisible = useCallback((agentId: string) => {
        const state = useStudioStore.getState()
        const agent = state.agents.find((entry) => entry.id === agentId)
        const isHidden = resolveNodeBaselineHidden(state.focusSnapshot, agentId, 'agent', !!agent?.hidden)
        if (!isHidden) {
            return
        }

        useStudioStore.setState((s) => {
            if (s.focusSnapshot) {
                return {
                    focusSnapshot: setFocusSnapshotNodeHidden(s.focusSnapshot, agentId, 'agent', false),
                }
            }

            return {
                agents: s.agents.map((entry) => (
                    entry.id === agentId ? { ...entry, hidden: false } : entry
                )),
            }
        })
    }, [])

    const ensureTeamVisible = useCallback((teamId: string) => {
        const state = useStudioStore.getState()
        const teamEntry = state.teams.find((entry) => entry.id === teamId)
        const isHidden = resolveNodeBaselineHidden(state.focusSnapshot, teamId, 'team', !!teamEntry?.hidden)
        if (!isHidden) {
            return
        }

        useStudioStore.setState((s) => {
            if (s.focusSnapshot) {
                return {
                    focusSnapshot: setFocusSnapshotNodeHidden(s.focusSnapshot, teamId, 'team', false),
                }
            }

            return {
                teams: s.teams.map((entry) => (
                    entry.id === teamId ? { ...entry, hidden: false } : entry
                )),
            }
        })
    }, [])

    const openAgent = (agentId: string) => {
        const {
            focusSnapshot: currentFocusSnapshot,
            viewMode: currentViewMode,
        } = useStudioStore.getState()

        ensureAgentVisible(agentId)

        closeEditor()
        selectAgentSession(null)
        openWorkspaceNodeInCurrentView(agentId, 'agent', currentFocusSnapshot, currentViewMode)
        setActiveChatAgent(agentId)
        revealCanvasNode(agentId, 'agent')
    }

    async function openAgentSession(agentId: string, session: { id: string; title?: string; sidebarTitle?: string }) {
        try {
            await bindExistingSession(useStudioStore.setState, useStudioStore.getState, agentId, session.id, {
                title: session.title,
            })
        } catch (error) {
            console.error('Failed to load session messages', error)
            showToast('Studio could not load messages for that thread.', 'error', {
                title: 'Thread load failed',
                dedupeKey: `thread:load:${agentId}:${session.id}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void openAgentSession(agentId, session)
                },
            })
        }
        const {
            focusSnapshot: currentFocusSnapshot,
            viewMode: currentViewMode,
        } = useStudioStore.getState()
        ensureAgentVisible(agentId)
        closeEditor()
        openWorkspaceNodeInCurrentView(agentId, 'agent', currentFocusSnapshot, currentViewMode)
        selectAgentSession(session.id)
        setActiveChatAgent(agentId)
        revealCanvasNode(agentId, 'agent')
    }

    const openTeam = useCallback((teamId: string) => {
        const {
            focusSnapshot: currentFocusSnapshot,
            viewMode: currentViewMode,
        } = useStudioStore.getState()

        ensureTeamVisible(teamId)

        closeEditor()
        openWorkspaceNodeInCurrentView(teamId, 'team', currentFocusSnapshot, currentViewMode)
        revealCanvasNode(teamId, 'team')
    }, [closeEditor, ensureTeamVisible, openWorkspaceNodeInCurrentView, revealCanvasNode])

    const openTeamThread = useCallback((teamId: string, threadId: string) => {
        const {
            focusSnapshot: currentFocusSnapshot,
            viewMode: currentViewMode,
        } = useStudioStore.getState()

        ensureTeamVisible(teamId)

        closeEditor()
        openWorkspaceNodeInCurrentView(teamId, 'team', currentFocusSnapshot, currentViewMode)
        selectThread(teamId, threadId)
        revealCanvasNode(teamId, 'team')
    }, [closeEditor, ensureTeamVisible, openWorkspaceNodeInCurrentView, revealCanvasNode, selectThread])

    return {
        workspaceId,
        teams: visibleTeams,
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
        onToggleExpanded: toggleExpanded,
        onSetPendingDelete: setPendingDelete,
        onBeginRenameAgentSession: beginRenameAgentSession,
        onCommitRenameSession: commitRenameSession,
        onCancelRenameSession: cancelRenameSession,
        onSetRenamingValue: (value) => setRenamingSession((current) => current ? { ...current, value } : current),
        agentSessionLabel,
        onOpenAgent: openAgent,
        onOpenAgentSession: openAgentSession,
        onDeleteSession: deleteSession,
        onAddAgent: () => addAgent(`Studio Agent ${sharedAgents.length + 1}`),
        onAddTeam: () => useStudioStore.getState().addTeam(`Team ${teams.length + 1}`),
        onToggleAgentVisibility: toggleAgentVisibility,
        onOpenAgentEditor: openAgentEditor,
        onSetActiveChatAgent: setActiveChatAgent,
        onRemoveAgent: removeAgent,
        onSaveAgentAsDraft: saveAgentAsDraft,
        onOpenTeam: openTeam,
        onCreateThread: async (teamId) => {
            await createThread(teamId)
        },
        onSaveTeamAsDraft: saveTeamAsDraft,
        onToggleTeamVisibility: toggleTeamVisibility,
        onRemoveTeam: removeTeam,
        onSelectThread: openTeamThread,
        onDeleteThread: deleteThread,
        onRenameThread: renameThread,
        onStartNewSession: (agentId) => void startNewSession(agentId),
        onOpenTeamEditor: (teamId) => openTeamEditor(teamId),
    }
}
