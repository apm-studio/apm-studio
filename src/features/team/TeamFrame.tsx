/**
 * TeamFrame — runtime-first Team canvas window with explicit edit mode.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Workflow } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import {
    TEAM_DEFAULT_WIDTH,
    TEAM_MIN_EXPANDED_HEIGHT,
    resolveTeamExpandedHeight,
} from '../../lib/team-layout'
import { resolveTeamThreadOrdinal, resolveDisplayedTeamThread } from '../../lib/team-threads'
import TeamHeaderActions from './TeamHeaderActions'
import TeamSurfacePanel from './TeamSurfacePanel'
import { getCanvasViewportSize, isFocusTarget, isSplitViewTarget } from '../../lib/focus-utils'
import { evaluateTeamReadiness } from './team-readiness'
import './TeamFrame.css'

const EMPTY_THREADS: never[] = []

type TeamFrameData = {
    width?: number
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
}

export default function TeamFrame({ data, id }: NodeProps<Node<TeamFrameData, 'team'>>) {
    const {
        teams,
        agents,
        selectedTeamId,
        teamEditorState,
        selectTeam,
        openTeamEditor,
        closeTeamEditor,
        toggleTeamVisibility,
        activeThreadId,
        teamThreads,
        focusSnapshot,
        viewMode,
        workspaceMode,
        splitView,
        enterFocusMode,
        exitFocusMode,
        removeSplitViewPane,
    } = useStudioStore(useShallow((state) => ({
        teams: state.teams,
        agents: state.agents,
        selectedTeamId: state.selectedTeamId,
        teamEditorState: state.teamEditorState,
        selectTeam: state.selectTeam,
        openTeamEditor: state.openTeamEditor,
        closeTeamEditor: state.closeTeamEditor,
        toggleTeamVisibility: state.toggleTeamVisibility,
        activeThreadId: state.activeThreadId,
        teamThreads: state.teamThreads,
        focusSnapshot: state.focusSnapshot,
        viewMode: state.viewMode,
        workspaceMode: state.workspaceMode,
        splitView: state.splitView,
        enterFocusMode: state.enterFocusMode,
        exitFocusMode: state.exitFocusMode,
        removeSplitViewPane: state.removeSplitViewPane,
    })))
    const bodyRef = useRef<HTMLDivElement>(null)

    const team = useMemo(() => teams.find((a) => a.id === id), [teams, id])
    const readiness = useMemo(
        () => team ? evaluateTeamReadiness(team, agents) : { runnable: false, issues: [] },
        [team, agents],
    )

    const isSelected = selectedTeamId === id
    const isFocused = viewMode === 'full' && isFocusTarget(focusSnapshot, id, 'team')
    const splitPane = splitView.panes.find((pane) => pane.type === 'team' && pane.nodeId === id) || null
    const isSplitPane = isSplitViewTarget(viewMode, splitView, id, 'team')
    const isFullscreenSurface = isFocused || isSplitPane
    const isManageMode = workspaceMode === 'studio-agent' && !isFullscreenSurface
    const isExplicitEditing = teamEditorState?.teamId === id
    const isEditing = isManageMode || isExplicitEditing
    const width = data.width || team?.width || TEAM_DEFAULT_WIDTH
    const height = resolveTeamExpandedHeight(team?.height)
    const threads = useMemo(() => teamThreads[id] || EMPTY_THREADS, [teamThreads, id])
    const displayedThread = useMemo(
        () => resolveDisplayedTeamThread(threads, activeThreadId),
        [activeThreadId, threads],
    )
    const displayedThreadOrdinal = useMemo(
        () => resolveTeamThreadOrdinal(threads, displayedThread?.id || null),
        [displayedThread?.id, threads],
    )

    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        const handler = (event: WheelEvent) => { event.stopPropagation() }
        el.addEventListener('wheel', handler, { passive: true })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    const handleSelectTeam = () => selectTeam(id)
    const handleToggleEdit = () => {
        if (isManageMode) return
        if (isExplicitEditing) {
            closeTeamEditor()
            return
        }
        openTeamEditor(id, 'team')
    }
    const handleToggleFocus = useCallback(() => {
        if (workspaceMode === 'studio-agent' && isFocused) return
        if (isFocused) {
            exitFocusMode()
            return
        }

        enterFocusMode(id, 'team', getCanvasViewportSize())
    }, [enterFocusMode, exitFocusMode, id, isFocused, workspaceMode])
    const handleRemoveSplitPane = useCallback(() => {
        if (!splitPane) return
        removeSplitViewPane(splitPane.paneId, getCanvasViewportSize())
    }, [removeSplitViewPane, splitPane])

    if (!team) {
        return null
    }

    return (
        <div className="team-frame-shell">
            <CanvasWindowFrame
                className={`team-frame nowheel ${isSelected ? 'team-frame--selected' : ''} ${isEditing ? 'team-frame--editing' : ''} ${isFocused ? 'canvas-frame--focused' : ''} ${isSplitPane ? 'canvas-frame--split-pane' : ''} team-frame--chat`}
                width={width}
                height={height}
                focused={isFocused}
                locked={isFullscreenSurface}
                dragHandle={splitPane ? {
                    id: `split-pane-frame:${splitPane.paneId}`,
                    data: {
                        kind: 'team',
                        source: 'split-pane',
                        paneId: splitPane.paneId,
                        nodeId: id,
                        nodeType: 'team',
                        label: team.name,
                        name: team.name,
                    },
                    title: 'Move Split View pane',
                } : undefined}
                minWidth={TEAM_DEFAULT_WIDTH}
                minHeight={TEAM_MIN_EXPANDED_HEIGHT}
                transformActive={data.transformActive || false}
                onActivateTransform={data.onActivateTransform}
                onDeactivateTransform={data.onDeactivateTransform}
                selected={isSelected}
                headerStart={
                    <div className="team-frame__title" onClick={handleSelectTeam}>
                        <Workflow size={12} className="team-frame__icon" />
                        <span className="team-frame__name">{team.name}</span>
                        {displayedThreadOrdinal ? (
                            <span className="team-frame__thread-chip">
                                #{displayedThreadOrdinal}
                            </span>
                        ) : null}
                    </div>
                }
                headerEnd={(
                    <TeamHeaderActions
                        focused={isFocused}
                        splitPane={isSplitPane}
                        editing={isEditing}
                        hideFocusControl={isManageMode || (workspaceMode === 'studio-agent' && isFocused)}
                        hideEditControl={isManageMode}
                        readiness={readiness}
                        onToggleFocus={handleToggleFocus}
                        onRemoveSplitPane={handleRemoveSplitPane}
                        onToggleEdit={handleToggleEdit}
                        onHide={() => toggleTeamVisibility(id)}
                    />
                )}
                bodyClassName="nowheel nodrag"
                bodyRef={bodyRef}
            >
                <TeamSurfacePanel teamId={id} />
            </CanvasWindowFrame>
        </div>
    )
}
