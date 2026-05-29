import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Columns2, Maximize2, PanelTop, Plus, Search, Users, Workflow, X } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import {
    getCanvasViewportSize,
    resolveFocusTarget,
    resolveNodeBaselineHidden,
    SPLIT_VIEW_MAX_PANES,
} from '../../lib/focus-utils'
import type { FullscreenNodeType, SplitViewPane } from '../../store/workspace/types'
import CanvasControls from './CanvasControls'
import './StudioViewHeader.css'

const WorkspaceToolbar = lazy(() => import('../toolbar/WorkspaceToolbar'))

type PickerKind = FullscreenNodeType
type ViewMode = 'canvas' | 'full' | 'split'
type ViewModeTarget = { id: string; type: FullscreenNodeType }
type HeaderModeOption = 'full' | 'split'

function paneLabel(pane: SplitViewPane, teams: WorkspaceTeamSnapshot[], agents: WorkspaceAgentNode[]) {
    if (pane.type === 'team') {
        return teams.find((team) => team.id === pane.nodeId)?.name || 'Team'
    }

    return agents.find((agent) => agent.id === pane.nodeId)?.name || 'Agent'
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

const RUN_VIEW_MODE_OPTIONS: HeaderModeOption[] = ['full', 'split']

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
    const [pickerOpen, setPickerOpen] = useState(false)
    const [pickerKind, setPickerKind] = useState<PickerKind>('team')
    const [query, setQuery] = useState('')
    const headerRef = useRef<HTMLDivElement | null>(null)
    const searchRef = useRef<HTMLInputElement | null>(null)

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
        addSplitViewPane,
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
        addSplitViewPane: state.addSplitViewPane,
        setSplitViewActivePane: state.setSplitViewActivePane,
        exitFocusMode: state.exitFocusMode,
    })))

    const fullscreenTarget = resolveFocusTarget(focusSnapshot)
    const queryText = query.trim().toLowerCase()
    const visibleTeams = useMemo(() => teams.filter((team) => (
        !resolveNodeBaselineHidden(focusSnapshot, team.id, 'team', !!team.hidden)
    )), [teams, focusSnapshot])
    const visibleAgents = useMemo(() => agents.filter((agent) => (
        !resolveNodeBaselineHidden(focusSnapshot, agent.id, 'agent', !!agent.hidden)
    )), [agents, focusSnapshot])
    const shownKeys = useMemo(
        () => new Set(splitView.panes.map((pane) => `${pane.type}:${pane.nodeId}`)),
        [splitView.panes],
    )
    const hasRestorableSplitView = useMemo(() => splitView.panes.some((pane) => (
        pane.type === 'team'
            ? teams.some((team) => team.id === pane.nodeId)
            : agents.some((agent) => agent.id === pane.nodeId)
    )), [teams, agents, splitView.panes])
    const pickerItems = useMemo(() => {
        const source = pickerKind === 'team'
            ? visibleTeams.map((team) => ({ id: team.id, type: 'team' as const, name: team.name }))
            : visibleAgents.map((agent) => ({ id: agent.id, type: 'agent' as const, name: agent.name }))

        return source.filter((item) => !queryText || item.name.toLowerCase().includes(queryText))
    }, [pickerKind, queryText, visibleTeams, visibleAgents])

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

        setPickerOpen(false)
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

    const togglePicker = () => {
        if (splitView.panes.length >= SPLIT_VIEW_MAX_PANES) return
        setPickerOpen((open) => !open)
    }

    const handlePick = (nodeId: string, nodeType: FullscreenNodeType) => {
        const key = `${nodeType}:${nodeId}`
        if (shownKeys.has(key)) {
            setSplitViewActivePane(nodeId, nodeType)
        } else {
            addSplitViewPane(nodeId, nodeType, getCanvasViewportSize())
        }
        setPickerOpen(false)
        setQuery('')
    }

    const showPicker = viewMode === 'split' && pickerOpen
    const fullViewPane = fullscreenTarget
        ? {
            paneId: `${fullscreenTarget.type}:${fullscreenTarget.id}`,
            nodeId: fullscreenTarget.id,
            type: fullscreenTarget.type,
        } satisfies SplitViewPane
        : null

    useEffect(() => {
        if (!showPicker) return
        searchRef.current?.focus()
    }, [showPicker])

    useEffect(() => {
        if (!showPicker) return

        const handlePointerDown = (event: PointerEvent) => {
            if (headerRef.current?.contains(event.target as Node)) return
            setPickerOpen(false)
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setPickerOpen(false)
            }
        }

        document.addEventListener('pointerdown', handlePointerDown, true)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [showPicker])

    return (
        <div ref={headerRef} className={`studio-view-header studio-view-header--${viewMode} studio-view-header--${workspaceMode}`}>
            <div className="studio-view-header__context">
                {workspaceMode === 'run' ? (
                    <div className="studio-view-header__mode-switch" aria-label="Run view mode">
                        {RUN_VIEW_MODE_OPTIONS.map((option) => {
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
                    <span className="studio-view-header__mode-pill">Manage canvas</span>
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
                {viewMode === 'split' ? (
                    <div className="studio-view-header__split-tools" aria-label="Split View controls">
                        <span className="studio-view-header__pane-count">{splitView.panes.length}/{SPLIT_VIEW_MAX_PANES}</span>
                        <button
                            type="button"
                            className="icon-btn"
                            onClick={togglePicker}
                            aria-label="Add Split View pane"
                            aria-expanded={pickerOpen}
                            aria-controls="studio-view-pane-picker"
                            title={splitView.panes.length >= SPLIT_VIEW_MAX_PANES ? `Split View supports up to ${SPLIT_VIEW_MAX_PANES} panes` : 'Add pane'}
                            disabled={splitView.panes.length >= SPLIT_VIEW_MAX_PANES}
                        >
                            <Plus size={13} />
                        </button>
                    </div>
                ) : null}
                {workspaceMode === 'manage' && viewMode === 'canvas' ? (
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

            {showPicker ? (
                <div id="studio-view-pane-picker" className="studio-view-picker" role="dialog" aria-label="Add Split View pane">
                    <div className="studio-view-picker__head">
                        <div className="studio-view-picker__tabs">
                            <button
                                type="button"
                                className={`tab ${pickerKind === 'team' ? 'active' : ''}`}
                                onClick={() => setPickerKind('team')}
                            >
                                <Workflow size={11} />
                                Teams
                            </button>
                            <button
                                type="button"
                                className={`tab ${pickerKind === 'agent' ? 'active' : ''}`}
                                onClick={() => setPickerKind('agent')}
                            >
                                <Users size={11} />
                                Agents
                            </button>
                        </div>
                        <button
                            type="button"
                            className="icon-btn"
                            onClick={() => setPickerOpen(false)}
                            aria-label="Close Split View picker"
                            title="Close picker"
                        >
                            <X size={12} />
                        </button>
                    </div>
                    <label className="studio-view-picker__search">
                        <Search size={12} />
                        <input
                            ref={searchRef}
                            className="input"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Find pane"
                        />
                    </label>
                    <div className="studio-view-picker__list">
                        {pickerItems.map((item) => {
                            const shown = shownKeys.has(`${item.type}:${item.id}`)
                            return (
                                <button
                                    type="button"
                                    key={`${item.type}:${item.id}`}
                                    className={`studio-view-picker__row ${shown ? 'is-shown' : ''}`}
                                    onClick={() => handlePick(item.id, item.type)}
                                >
                                    {item.type === 'team' ? <Workflow size={13} /> : <Users size={13} />}
                                    <span>{item.name}</span>
                                    <small>{shown ? 'Shown' : 'Add'}</small>
                                </button>
                            )
                        })}
                        {pickerItems.length === 0 ? (
                            <div className="studio-view-picker__empty">No matches</div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
