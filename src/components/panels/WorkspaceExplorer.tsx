import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { useStudioStore } from '../../store';
import { bindExistingSession } from '../../store/session';
import { DropdownMenu } from '../shared/DropdownMenu';
import { parseStudioSessionTitle } from '../../../shared/session-metadata';
import {
    Folder,
    MoreHorizontal,
} from 'lucide-react';
import './WorkspaceExplorer.css';
import './WorkspaceExplorerItems.css';
import {
    workspaceLabel,
    buildPerformerSessionRows,
    groupPerformerSessionsById,
    buildThreadRows,
    LayerRow,
    resolveSessionActivityAt,
    workspaceShortPath,
} from './workspace-explorer-utils';
import {
    getCanvasViewportSize,
    resolveNodeBaselineHidden,
    SPLIT_VIEW_MAX_PANES,
    setFocusSnapshotNodeHidden,
} from '../../lib/focus-utils';
import type { FocusSnapshot, FullscreenNodeType, WorkspaceViewMode } from '../../store/types';
import type { ExplorerRenamingSession } from './workspace-explorer-utils';
import WorkspaceExplorerWorkspacesSection from './WorkspaceExplorerWorkspacesSection';
import WorkspaceExplorerThreadsSection from './WorkspaceExplorerThreadsSection';


type WorkspaceExplorerProps = {
    workspaceOnly?: boolean
    showThreads?: boolean
}

function useWorkspaceExplorerWorkspaces() {
    const {
        workspaceId,
        workingDir,
        workspaceList,
        newWorkspace,
        closeWorkspace,
        loadWorkspace,
        listWorkspaces,
        deleteWorkspace,
    } = useStudioStore(useShallow((state) => ({
        workspaceId: state.workspaceId,
        workingDir: state.workingDir,
        workspaceList: state.workspaceList,
        newWorkspace: state.newWorkspace,
        closeWorkspace: state.closeWorkspace,
        loadWorkspace: state.loadWorkspace,
        listWorkspaces: state.listWorkspaces,
        deleteWorkspace: state.deleteWorkspace,
    })));

    const openWorkspacePath = useCallback(async (targetPath: string) => {
        try {
            await api.studio.openPath(targetPath);
        } catch (error) {
            console.error('Failed to open workspace path', error);
            showToast('Studio could not open that workspace path.', 'error', {
                title: 'Open failed',
                dedupeKey: `workspace:open:${targetPath}`,
            });
        }
    }, []);

    useEffect(() => {
        listWorkspaces();
    }, [listWorkspaces, workingDir]);

    const workspaceRows = useMemo(() => workspaceList.map((entry) => (
        <LayerRow
            key={entry.id}
            icon={<Folder size={12} className={entry.id === workspaceId ? 'icon-active' : 'icon-muted'} />}
            label={workspaceLabel(entry.workingDir)}
            meta={workspaceShortPath(entry.workingDir)}
            active={entry.id === workspaceId}
            onClick={() => loadWorkspace(entry.id)}
            actions={
                <DropdownMenu
                    align="right"
                    trigger={(
                        <button className="icon-btn" title="Workspace actions">
                            <MoreHorizontal size={10} />
                        </button>
                    )}
                    items={[
                        {
                            label: 'Open',
                            onClick: () => {
                                void openWorkspacePath(entry.workingDir);
                            },
                        },
                        'separator',
                        {
                            label: 'Close workspace',
                            onClick: () => closeWorkspace(entry.id),
                        },
                        'separator',
                        {
                            label: 'Delete workspace',
                            onClick: () => deleteWorkspace(entry.id),
                            variant: 'danger',
                        },
                    ]}
                />
            }
        />
    )), [closeWorkspace, deleteWorkspace, loadWorkspace, openWorkspacePath, workspaceId, workspaceList]);

    return {
        workspaceId,
        workingDir,
        workspaceRows,
        newWorkspace,
    };
}

export default function WorkspaceExplorer({ workspaceOnly = false, showThreads = true }: WorkspaceExplorerProps) {
    return workspaceOnly ? <WorkspaceOnlyExplorer /> : <WorkspaceExplorerFull showThreads={showThreads} />;
}

function WorkspaceOnlyExplorer() {
    const { workingDir, workspaceRows, newWorkspace } = useWorkspaceExplorerWorkspaces();

    return (
        <div className="explorer explorer--stacked explorer--workspace-only">
            <WorkspaceExplorerWorkspacesSection
                workspacesHeight={208}
                workspaceRows={workspaceRows}
                workingDir={workingDir}
                onOpenWorkspace={newWorkspace}
                fill
            />
        </div>
    );
}

function WorkspaceExplorerFull({ showThreads }: { showThreads: boolean }) {
    const [workspacesHeight, setWorkspacesHeight] = useState(208);
    const dividerDragging = useRef(false);
    const { workspaceId, workingDir, workspaceRows, newWorkspace } = useWorkspaceExplorerWorkspaces();

    const suppressNextClick = useCallback(() => {
        const handleClickCapture = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            document.removeEventListener('click', handleClickCapture, true);
        };

        document.addEventListener('click', handleClickCapture, true);
        window.setTimeout(() => {
            document.removeEventListener('click', handleClickCapture, true);
        }, 0);
    }, []);

    const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dividerDragging.current = true;
        const startY = e.clientY;
        const startH = workspacesHeight;

        const onMove = (ev: MouseEvent) => {
            if (!dividerDragging.current) return;
            const delta = ev.clientY - startY;
            setWorkspacesHeight(Math.min(400, Math.max(80, startH + delta)));
        };
        const onUp = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            dividerDragging.current = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            suppressNextClick();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    }, [suppressNextClick, workspacesHeight]);
    const {
        performers,
        sessions,
        seEntities,
        seMessages,
        chatKeyToSession,
        editingTarget,
        selectedPerformerId,
        selectedPerformerSessionId,
        listSessions,
        addPerformer,
        selectPerformer,
        selectPerformerSession,
        setActiveChatPerformer,
        openPerformerEditor,
        closeEditor,
        deleteSession,
        togglePerformerVisibility,
        removePerformer,
        savePerformerAsDraft,
        saveActAsDraft,
    } = useStudioStore(useShallow((state) => ({
        performers: state.performers,
        sessions: state.sessions,
        seEntities: state.seEntities,
        seMessages: state.seMessages,
        chatKeyToSession: state.chatKeyToSession,
        editingTarget: state.editingTarget,
        selectedPerformerId: state.selectedPerformerId,
        selectedPerformerSessionId: state.selectedPerformerSessionId,
        listSessions: state.listSessions,
        addPerformer: state.addPerformer,
        selectPerformer: state.selectPerformer,
        selectPerformerSession: state.selectPerformerSession,
        setActiveChatPerformer: state.setActiveChatPerformer,
        openPerformerEditor: state.openPerformerEditor,
        closeEditor: state.closeEditor,
        deleteSession: state.deleteSession,
        togglePerformerVisibility: state.togglePerformerVisibility,
        removePerformer: state.removePerformer,
        savePerformerAsDraft: state.savePerformerAsDraft,
        saveActAsDraft: state.saveActAsDraft,
    })));

    const acts = useStudioStore((s) => s.acts);
    const selectedActId = useStudioStore((s) => s.selectedActId);
    const selectAct = useStudioStore((s) => s.selectAct);
    const removeAct = useStudioStore((s) => s.removeAct);

    const toggleActVisibility = useStudioStore((s) => s.toggleActVisibility);
    const actThreads = useStudioStore((s) => s.actThreads);
    const activeThreadId = useStudioStore((s) => s.activeThreadId);
    const createThread = useStudioStore((s) => s.createThread);
    const selectThread = useStudioStore((s) => s.selectThread);
    const deleteThread = useStudioStore((s) => s.deleteThread);
    const renameThread = useStudioStore((s) => s.renameThread);
    const startNewSession = useStudioStore((s) => s.startNewSession);
    const openActEditor = useStudioStore((s) => s.openActEditor);
    const focusSnapshot = useStudioStore((s) => s.focusSnapshot);

    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [renamingSession, setRenamingSession] = useState<ExplorerRenamingSession>(null);

    useEffect(() => {
        if (!showThreads) return;
        listSessions();
    }, [listSessions, showThreads, workingDir]);

    const sharedPerformers = useMemo(
        () => performers.filter((performer) => performer.scope === 'shared'),
        [performers],
    );

    const performerSessionRows = useMemo(() => {
        if (!showThreads) return [];

        const sessionActivityById = Object.fromEntries(
            sessions.map((session) => {
                const entity = seEntities[session.id];
                const latestMessageTimestamp = (seMessages[session.id] || []).reduce(
                    (latest, message) => Math.max(latest, message.timestamp || 0),
                    0,
                );
                return [session.id, resolveSessionActivityAt({
                    createdAt: Math.max(session.createdAt || 0, entity?.createdAt || 0),
                    updatedAt: Math.max(session.updatedAt || 0, entity?.updatedAt || 0),
                }, latestMessageTimestamp)];
            }),
        );

        return buildPerformerSessionRows(
            sessions.map((session) => ({
                ...session,
                updatedAt: sessionActivityById[session.id] || session.updatedAt,
            })),
            performers,
            chatKeyToSession,
        );
    }, [chatKeyToSession, performers, seEntities, seMessages, sessions, showThreads]);

    const performerSessionsById = useMemo(() => {
        return groupPerformerSessionsById(performerSessionRows);
    }, [performerSessionRows]);

    const threadRows = useMemo(() => {
        return buildThreadRows({
            sharedPerformers,
            editingTarget: editingTarget?.type === 'performer' ? editingTarget : null,
            performerSessionsById,
            focusSnapshot,
            selectedPerformerId,
            selectedPerformerSessionId,
        });
    }, [editingTarget, focusSnapshot, performerSessionsById, selectedPerformerId, selectedPerformerSessionId, sharedPerformers]);

    const visibleActs = useMemo(() => acts.map((act) => ({
        ...act,
        hidden: resolveNodeBaselineHidden(focusSnapshot, act.id, 'act', !!act.hidden),
    })), [acts, focusSnapshot]);

    const toggleExpanded = (key: string) => {
        setExpandedRows((current) => ({
            ...current,
            [key]: !current[key],
        }));
    };

    const performerSessionLabel = useCallback((session: { id: string; title?: string; sidebarTitle?: string }) => {
        if (session.sidebarTitle?.trim()) {
            return session.sidebarTitle.trim();
        }
        const metadata = parseStudioSessionTitle(session.title);
        return metadata?.label || ('slug' in session && typeof session.slug === 'string' ? session.slug : null) || session.id.slice(0, 8);
    }, []);

    const beginRenamePerformerSession = useCallback((session: { id: string; title?: string; sidebarTitle?: string }) => {
        setRenamingSession({
            key: `performer:${session.id}`,
            kind: 'performer',
            sessionId: session.id,
            value: performerSessionLabel(session),
        });
    }, [performerSessionLabel]);

    const cancelRenameSession = useCallback(() => {
        setRenamingSession(null);
    }, []);

    const commitRenameSession = useCallback(async () => {
        if (!renamingSession) {
            return;
        }

        const nextLabel = renamingSession.value.trim();
        if (!nextLabel) {
            cancelRenameSession();
            return;
        }

        try {
            await api.chat.updateSession(renamingSession.sessionId, nextLabel);
            await listSessions();
            setRenamingSession(null);
        } catch (error) {
            console.error('Failed to rename session', error);
            showToast('Studio could not rename that thread.', 'error', {
                title: 'Thread rename failed',
                dedupeKey: `thread:rename:${renamingSession.sessionId}`,
            });
        }
    }, [cancelRenameSession, listSessions, renamingSession]);

    const switchFocusTarget = useStudioStore((s) => s.switchFocusTarget);
    const addSplitViewPane = useStudioStore((s) => s.addSplitViewPane);
    const replaceSplitViewPane = useStudioStore((s) => s.replaceSplitViewPane);
    const setSplitViewActivePane = useStudioStore((s) => s.setSplitViewActivePane);
    const revealCanvasNode = useStudioStore((s) => s.revealCanvasNode);

    const openWorkspaceNodeInCurrentView = useCallback((
        nodeId: string,
        nodeType: FullscreenNodeType,
        currentFocusSnapshot: FocusSnapshot | null,
        currentViewMode: WorkspaceViewMode,
    ) => {
        if (currentViewMode === 'split') {
            const state = useStudioStore.getState();
            const openPane = state.splitView.panes.find((pane) => pane.nodeId === nodeId && pane.type === nodeType);
            if (openPane) {
                setSplitViewActivePane(nodeId, nodeType);
                return;
            }

            if (state.splitView.panes.length >= SPLIT_VIEW_MAX_PANES) {
                const replacementPane = state.splitView.panes.find((pane) => pane.paneId === state.splitView.activePaneId)
                    || state.splitView.panes[0];
                if (replacementPane) {
                    replaceSplitViewPane(replacementPane.paneId, nodeId, nodeType, getCanvasViewportSize());
                    return;
                }
            }

            addSplitViewPane(nodeId, nodeType, getCanvasViewportSize());
            return;
        }

        if (currentViewMode === 'full' && !currentFocusSnapshot) {
            useStudioStore.getState().enterFocusMode(nodeId, nodeType, getCanvasViewportSize());
            return;
        }

        const shouldSwitchFocus = Boolean(currentFocusSnapshot && (
            currentFocusSnapshot.nodeId !== nodeId
            || currentFocusSnapshot.type !== nodeType
        ));

        if (shouldSwitchFocus) {
            switchFocusTarget(nodeId, nodeType);
            return;
        }

        if (nodeType === 'performer') {
            selectPerformer(nodeId);
            return;
        }

        selectAct(nodeId);
    }, [addSplitViewPane, replaceSplitViewPane, selectAct, selectPerformer, setSplitViewActivePane, switchFocusTarget]);

    const ensurePerformerVisible = useCallback((performerId: string) => {
        const state = useStudioStore.getState();
        const performer = state.performers.find((entry) => entry.id === performerId);
        const isHidden = resolveNodeBaselineHidden(state.focusSnapshot, performerId, 'performer', !!performer?.hidden);
        if (!isHidden) {
            return;
        }

        useStudioStore.setState((s) => {
            if (s.focusSnapshot) {
                return {
                    focusSnapshot: setFocusSnapshotNodeHidden(s.focusSnapshot, performerId, 'performer', false),
                };
            }

            return {
                performers: s.performers.map((entry) => (
                    entry.id === performerId ? { ...entry, hidden: false } : entry
                )),
            };
        });
    }, []);

    const ensureActVisible = useCallback((actId: string) => {
        const state = useStudioStore.getState();
        const actEntry = state.acts.find((entry) => entry.id === actId);
        const isHidden = resolveNodeBaselineHidden(state.focusSnapshot, actId, 'act', !!actEntry?.hidden);
        if (!isHidden) {
            return;
        }

        useStudioStore.setState((s) => {
            if (s.focusSnapshot) {
                return {
                    focusSnapshot: setFocusSnapshotNodeHidden(s.focusSnapshot, actId, 'act', false),
                };
            }

            return {
                acts: s.acts.map((entry) => (
                    entry.id === actId ? { ...entry, hidden: false } : entry
                )),
            };
        });
    }, []);

    const openPerformer = (performerId: string) => {
        const {
            focusSnapshot: currentFocusSnapshot,
            viewMode: currentViewMode,
        } = useStudioStore.getState();

        ensurePerformerVisible(performerId);

        closeEditor();
        selectPerformerSession(null);
        openWorkspaceNodeInCurrentView(performerId, 'performer', currentFocusSnapshot, currentViewMode);
        setActiveChatPerformer(performerId);
        revealCanvasNode(performerId, 'performer');
    };

    const openPerformerSession = async (performerId: string, session: { id: string; title?: string; sidebarTitle?: string }) => {
        try {
            await bindExistingSession(useStudioStore.setState, useStudioStore.getState, performerId, session.id, {
                title: session.title,
            });
        } catch (error) {
            console.error('Failed to load session messages', error);
            showToast('Studio could not load messages for that thread.', 'error', {
                title: 'Thread load failed',
                dedupeKey: `thread:load:${performerId}:${session.id}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void openPerformerSession(performerId, session)
                },
            });
        }
        const {
            focusSnapshot: currentFocusSnapshot,
            viewMode: currentViewMode,
        } = useStudioStore.getState();
        ensurePerformerVisible(performerId);
        closeEditor();
        openWorkspaceNodeInCurrentView(performerId, 'performer', currentFocusSnapshot, currentViewMode);
        selectPerformerSession(session.id);
        setActiveChatPerformer(performerId);
        revealCanvasNode(performerId, 'performer');
    };

    const openAct = useCallback((actId: string) => {
        const {
            focusSnapshot: currentFocusSnapshot,
            viewMode: currentViewMode,
        } = useStudioStore.getState();

        ensureActVisible(actId);

        closeEditor();
        openWorkspaceNodeInCurrentView(actId, 'act', currentFocusSnapshot, currentViewMode);
        revealCanvasNode(actId, 'act');
    }, [closeEditor, ensureActVisible, openWorkspaceNodeInCurrentView, revealCanvasNode]);

    const openActThread = useCallback((actId: string, threadId: string) => {
        const {
            focusSnapshot: currentFocusSnapshot,
            viewMode: currentViewMode,
        } = useStudioStore.getState();

        ensureActVisible(actId);

        closeEditor();
        openWorkspaceNodeInCurrentView(actId, 'act', currentFocusSnapshot, currentViewMode);
        selectThread(actId, threadId);
        revealCanvasNode(actId, 'act');
    }, [closeEditor, ensureActVisible, openWorkspaceNodeInCurrentView, revealCanvasNode, selectThread]);

    return (
        <div className="explorer explorer--stacked">
            <WorkspaceExplorerWorkspacesSection
                workspacesHeight={workspacesHeight}
                workspaceRows={workspaceRows}
                workingDir={workingDir}
                onOpenWorkspace={newWorkspace}
            />

            <div className="explorer__divider" onMouseDown={onDividerMouseDown} />

            <WorkspaceExplorerThreadsSection
                workspaceId={workspaceId}
                acts={visibleActs}
                showThreads={showThreads}
                threadRows={threadRows}
                expandedRows={expandedRows}
                pendingDelete={pendingDelete}
                renamingSession={renamingSession}
                editingTarget={editingTarget}
                selectedActId={selectedActId}
                activeThreadId={activeThreadId}
                actThreads={actThreads}
                sessions={sessions}
                seEntities={seEntities}
                seMessages={seMessages}
                onToggleExpanded={toggleExpanded}
                onSetPendingDelete={setPendingDelete}
                onBeginRenamePerformerSession={beginRenamePerformerSession}
                onCommitRenameSession={commitRenameSession}
                onCancelRenameSession={cancelRenameSession}
                onSetRenamingValue={(value) => setRenamingSession((current) => current ? { ...current, value } : current)}
                performerSessionLabel={performerSessionLabel}
                onOpenPerformer={openPerformer}
                onOpenPerformerSession={openPerformerSession}
                onDeleteSession={deleteSession}
                onAddPerformer={() => addPerformer(`Agent ${sharedPerformers.length + 1}`)}
                onAddAct={() => useStudioStore.getState().addAct(`Team ${acts.length + 1}`)}
                onTogglePerformerVisibility={togglePerformerVisibility}
                onOpenPerformerEditor={openPerformerEditor}
                onSetActiveChatPerformer={setActiveChatPerformer}
                onRemovePerformer={removePerformer}
                onSavePerformerAsDraft={savePerformerAsDraft}
                onOpenAct={openAct}
                onCreateThread={async (actId) => {
                    await createThread(actId)
                }}

                onSaveActAsDraft={saveActAsDraft}
                onToggleActVisibility={toggleActVisibility}
                onRemoveAct={removeAct}
                onSelectThread={openActThread}
                onDeleteThread={deleteThread}
                onRenameThread={renameThread}
                onStartNewSession={(performerId) => void startNewSession(performerId)}
                onOpenActEditor={(actId) => openActEditor(actId)}
            />
        </div>
    );
}
