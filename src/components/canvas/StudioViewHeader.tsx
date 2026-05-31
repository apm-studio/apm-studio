import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { Suspense, lazy, useMemo } from 'react'
import { Columns2, Maximize2, PanelTop, Users, Workflow } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import {
    getCanvasViewportSize,
    resolveFocusTarget,
    resolveNodeBaselineHidden,
} from '../../lib/focus-utils'
import type { FullscreenNodeType, SplitViewPane } from '../../store/workspace/types'
import CanvasControls from './CanvasControls'
import './StudioViewHeader.css'

const WorkspaceToolbar = lazy(() => import('../toolbar/WorkspaceToolbar'))

type ViewMode = 'canvas' | 'full' | 'split'
type ViewModeTarget = { id: string; type: FullscreenNodeType }
type HeaderModeOption = 'canvas' | 'full' | 'split'

function paneLabel(pane: SplitViewPane, teams: WorkspaceTeamSnapshot[], agents: WorkspaceAgentNode[]) {
    if (pane.type === 'team') {
        return teams.find((team) => team.id === pane.nodeId)?.name || 'Team'
    }

    return agents.find((agent) => agent.id === pane.nodeId)?.name || 'Studio Agent'
}

function modeLabel(viewMode: ViewMode) {
    if (viewMode === 'split') return 'Split'
    if (viewMode === 'full') return 'Full'
    return 'Canvas'
}

function ModeIcon({ viewMode }: { viewMode: ViewMode }) {
    if (viewMode === 'split') return <Columns2 size={13} />
    if (viewMode === 'full') return <Maximize2 size={13} />
    return <PanelTop size={13} />
}

const STUDIO_AGENT_VIEW_MODE_OPTIONS: HeaderModeOption[] = ['canvas', 'full', 'split']

type SplitPanePillProps = {
    pane: SplitViewPane
    label: string
    active: boolean
    onActivate: () => void
}

function SplitPanePill({ pane, label, active, onActivate }: SplitPanePillProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `split-pane:${pane.paneId}`,
        data: {
            kind: pane.type,
            source: 'split-pane',
            paneId: pane.paneId,
            nodeId: pane.nodeId,
            nodeType: pane.type,
            label,
            name: label,
        },
    })

    return (
        <button
            ref={setNodeRef}
            type="button"
            className={`studio-view-header__pane-pill ${active ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
            {...attributes}
            {...listeners}
            onClick={onActivate}
            aria-pressed={active}
            title={label}
        >
            {pane.type === 'team' ? <Workflow size={11} /> : <Users size={11} />}
            <span>{label}</span>
        </button>
    )
}

export default function StudioViewHeader() {
    const {
        teams,
        agents,
        focusSnapshot,
        viewMode,
        splitView,
        workspaceMode,
        selectedAgentId,
        selectedTeamId,
        enterFocusMode,
        enterEmptyFullView,
        enterEmptySplitView,
        enterSplitView,
        setSplitViewActivePane,
        exitFocusMode,
    } = useStudioStore(useShallow((state) => ({
        teams: state.teams,
        agents: state.agents,
        focusSnapshot: state.focusSnapshot,
        viewMode: state.viewMode,
        splitView: state.splitView,
        workspaceMode: state.workspaceMode,
        selectedAgentId: state.selectedAgentId,
        selectedTeamId: state.selectedTeamId,
        enterFocusMode: state.enterFocusMode,
        enterEmptyFullView: state.enterEmptyFullView,
        enterEmptySplitView: state.enterEmptySplitView,
        enterSplitView: state.enterSplitView,
        setSplitViewActivePane: state.setSplitViewActivePane,
        exitFocusMode: state.exitFocusMode,
    })))

    const fullscreenTarget = resolveFocusTarget(focusSnapshot)
    const visibleTeams = useMemo(() => teams.filter((team) => (
        !resolveNodeBaselineHidden(focusSnapshot, team.id, 'team', !!team.hidden)
    )), [teams, focusSnapshot])
    const visibleAgents = useMemo(() => agents.filter((agent) => (
        !resolveNodeBaselineHidden(focusSnapshot, agent.id, 'agent', !!agent.hidden)
    )), [agents, focusSnapshot])
    const hasRestorableSplitView = useMemo(() => splitView.panes.some((pane) => (
        pane.type === 'team'
            ? teams.some((team) => team.id === pane.nodeId)
            : agents.some((agent) => agent.id === pane.nodeId)
    )), [teams, agents, splitView.panes])

    const modeTarget = useMemo<ViewModeTarget | null>(() => {
        if (viewMode === 'split') {
            const activePane = splitView.panes.find((pane) => pane.paneId === splitView.activePaneId) || splitView.panes[0]
            if (activePane) {
                return { id: activePane.nodeId, type: activePane.type }
            }
        }

        if (fullscreenTarget) {
            return fullscreenTarget
        }

        if (selectedAgentId && visibleAgents.some((agent) => agent.id === selectedAgentId)) {
            return { id: selectedAgentId, type: 'agent' }
        }

        if (selectedTeamId && visibleTeams.some((team) => team.id === selectedTeamId)) {
            return { id: selectedTeamId, type: 'team' }
        }

        return null
    }, [fullscreenTarget, selectedTeamId, selectedAgentId, splitView.activePaneId, splitView.panes, viewMode, visibleTeams, visibleAgents])

    const handleSelectViewMode = (nextMode: ViewMode) => {
        if (nextMode === viewMode) return

        const viewportSize = getCanvasViewportSize()

        if (nextMode === 'canvas') {
            exitFocusMode()
            return
        }

        if (nextMode === 'split') {
            if (!hasRestorableSplitView) {
                enterEmptySplitView()
                return
            }
            enterSplitView(undefined, undefined, viewportSize)
            return
        }

        if (!modeTarget) {
            enterEmptyFullView()
            return
        }

        if (viewMode === 'split') {
            exitFocusMode()
            useStudioStore.getState().enterFocusMode(modeTarget.id, modeTarget.type, viewportSize)
            return
        }

        enterFocusMode(modeTarget.id, modeTarget.type, viewportSize)
    }

    const fullViewPane = fullscreenTarget
        ? {
            paneId: `${fullscreenTarget.type}:${fullscreenTarget.id}`,
            nodeId: fullscreenTarget.id,
            type: fullscreenTarget.type,
        } satisfies SplitViewPane
        : null

    return (
        <div className={`studio-view-header studio-view-header--${viewMode} studio-view-header--${workspaceMode}`}>
            <div className="studio-view-header__context">
                {workspaceMode === 'studio-agent' ? (
                    <div className="studio-view-header__mode-switch" aria-label="Studio Agent view mode">
                        {STUDIO_AGENT_VIEW_MODE_OPTIONS.map((option) => {
                            return (
                                <button
                                    type="button"
                                    key={option}
                                    className={`studio-view-header__mode-option ${viewMode === option ? 'is-active' : ''}`}
                                    onClick={() => handleSelectViewMode(option)}
                                    aria-pressed={viewMode === option}
                                    title={`Switch to ${modeLabel(option)} view`}
                                >
                                    <ModeIcon viewMode={option} />
                                    <span>{modeLabel(option)}</span>
                                </button>
                            )
                        })}
                    </div>
                ) : (
                    <span className="studio-view-header__mode-pill">Studio Agent</span>
                )}
                {viewMode === 'full' && fullViewPane ? (
                    <span className="studio-view-header__target-pill" title={paneLabel(fullViewPane, teams, agents)}>
                        {fullViewPane.type === 'team' ? <Workflow size={11} /> : <Users size={11} />}
                        <span>{paneLabel(fullViewPane, teams, agents)}</span>
                    </span>
                ) : null}
                {viewMode === 'split' ? (
                    <div className="studio-view-header__panes" aria-label="Split View panes">
                        {splitView.panes.map((pane) => {
                            const label = paneLabel(pane, teams, agents)
                            return (
                                <SplitPanePill
                                    key={pane.paneId}
                                    pane={pane}
                                    label={label}
                                    active={splitView.activePaneId === pane.paneId}
                                    onActivate={() => setSplitViewActivePane(pane.nodeId, pane.type)}
                                />
                            )
                        })}
                    </div>
                ) : null}
            </div>

            <div className="studio-view-header__tools">
                {workspaceMode === 'studio-agent' && viewMode === 'canvas' ? (
                    <>
                        <div className="studio-view-header__control-group" aria-label="Canvas controls">
                            <CanvasControls />
                        </div>
                        <Suspense fallback={null}>
                            <WorkspaceToolbar />
                        </Suspense>
                    </>
                ) : null}
            </div>
        </div>
    )
}
