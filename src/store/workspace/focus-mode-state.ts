import { resolveTeamExpandedHeight } from '../../lib/team-layout'
import {
    createEmptySplitViewState,
    getCanvasViewportSize,
    resolveFocusTarget,
} from '../../lib/focus-utils'
import {
    buildSplitViewLayoutState,
    resolveCanvasResetSplitView,
} from './split-view-layout'
import type {
    FocusSnapshot,
    FullscreenNodeRect,
    FullscreenNodeType,
    SplitViewState,
} from './types'
import type { StudioState } from '../types'

type FocusNodeType = FullscreenNodeType
type FocusTarget = { id: string; type: FocusNodeType }
type ViewportSize = { width: number; height: number }

const FOCUS_WINDOW_ORIGIN = { x: 0, y: 0 } as const

export function buildCanvasViewResetState(
    splitView: SplitViewState = createEmptySplitViewState(),
): Pick<StudioState, 'viewMode' | 'splitView' | 'focusSnapshot'> {
    return {
        viewMode: 'canvas',
        splitView,
        focusSnapshot: null,
    }
}

function resolveFocusNodeSize(state: StudioState, target: FocusTarget) {
    if (target.type === 'agent') {
        const agent = state.agents.find((entry) => entry.id === target.id)
        return agent
            ? { width: agent.width ?? 400, height: agent.height ?? 500 }
            : null
    }

    const team = state.teams.find((entry) => entry.id === target.id)
    return team
        ? { width: team.width ?? 400, height: resolveTeamExpandedHeight(team.height) }
        : null
}

function resolveFocusNodePosition(state: StudioState, target: FocusTarget) {
    if (target.type === 'agent') {
        return state.agents.find((entry) => entry.id === target.id)?.position || null
    }

    return state.teams.find((entry) => entry.id === target.id)?.position || null
}

function buildSnapshotNodeRects(state: StudioState): FullscreenNodeRect[] {
    return [
        ...state.agents.map((agent) => ({
            nodeId: agent.id,
            type: 'agent' as const,
            nodePosition: agent.position,
            nodeSize: {
                width: agent.width ?? 400,
                height: agent.height ?? 500,
            },
        })),
        ...state.teams.map((team) => ({
            nodeId: team.id,
            type: 'team' as const,
            nodePosition: team.position,
            nodeSize: {
                width: team.width ?? 400,
                height: resolveTeamExpandedHeight(team.height),
            },
        })),
    ]
}

export function buildFocusSnapshot(state: StudioState, target: FocusTarget): FocusSnapshot | null {
    const nodeSize = resolveFocusNodeSize(state, target)
    const nodePosition = resolveFocusNodePosition(state, target)
    if (!nodeSize || !nodePosition) {
        return null
    }

    return {
        nodeId: target.id,
        type: target.type,
        ...(target.type === 'team' ? { teamId: target.id } : {}),
        nodePosition,
        nodeSize,
        hiddenAgentIds: state.agents.filter((agent) => agent.hidden).map((agent) => agent.id),
        hiddenTeamIds: state.teams.filter((team) => team.hidden).map((team) => team.id),
        hiddenEditorIds: state.markdownEditors.filter((editor) => editor.hidden).map((editor) => editor.id),
        hiddenTerminalIds: [] as string[],
        packageLibraryOpen: state.isPackageLibraryOpen,
        assistantOpen: state.isAssistantOpen,
        trackingOpen: state.isTrackingOpen,
        terminalOpen: state.isTerminalOpen,
        nodeRects: buildSnapshotNodeRects(state),
    }
}

function focusSnapshotRectMap(snapshot: FocusSnapshot) {
    const rects = new Map<string, FullscreenNodeRect>()
    for (const rect of snapshot.nodeRects || []) {
        rects.set(`${rect.type}:${rect.nodeId}`, rect)
    }

    const targetKey = `${snapshot.type}:${snapshot.nodeId}`
    if (!rects.has(targetKey) && snapshot.nodePosition) {
        rects.set(targetKey, {
            nodeId: snapshot.nodeId,
            type: snapshot.type,
            nodePosition: snapshot.nodePosition,
            nodeSize: snapshot.nodeSize,
        })
    }

    return rects
}

export function buildEnterFocusModeState(
    state: StudioState,
    target: FocusTarget,
    viewportSize: ViewportSize,
): Partial<StudioState> | null {
    const snapshot = buildFocusSnapshot(state, target)
    if (!snapshot) {
        return null
    }

    const focusWidth = viewportSize.width
    const focusHeight = viewportSize.height

    return {
        viewMode: 'full',
        splitView: resolveCanvasResetSplitView(state),
        focusSnapshot: snapshot,
        selectedAgentId: target.type === 'agent' ? target.id : null,
        selectedTeamId: target.type === 'team' ? target.id : null,
        activeChatAgentId: target.type === 'agent' ? target.id : state.activeChatAgentId,
        agents: state.agents.map((agent) => (
            target.type === 'agent' && agent.id === target.id
                ? { ...agent, hidden: false, position: FOCUS_WINDOW_ORIGIN, width: focusWidth, height: focusHeight }
                : { ...agent, hidden: true }
        )),
        teams: state.teams.map((team) => (
            target.type === 'team' && team.id === target.id
                ? { ...team, hidden: false, position: FOCUS_WINDOW_ORIGIN, width: focusWidth, height: focusHeight }
                : { ...team, hidden: true }
        )),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: true })),
        isPackageLibraryOpen: false,
        isAssistantOpen: false,
        isTrackingOpen: false,
        isTerminalOpen: false,
        editingTarget: null,
        inspectorFocus: null,
    }
}

export function resolveCurrentFocusViewportSize(state: StudioState, target: FocusTarget): ViewportSize {
    if (target.type === 'agent') {
        const agent = state.agents.find((entry) => entry.id === target.id)
        return getCanvasViewportSize(
            typeof document !== 'undefined' ? document : undefined,
            {
                width: agent?.width || 800,
                height: agent?.height || 600,
            },
        )
    }

    const team = state.teams.find((entry) => entry.id === target.id)
    return getCanvasViewportSize(
        typeof document !== 'undefined' ? document : undefined,
        {
            width: team?.width || 800,
            height: team?.height || 600,
        },
    )
}

export function buildExitFocusModeState(state: StudioState): Partial<StudioState> | null {
    const snapshot = state.focusSnapshot
    const target = resolveFocusTarget(snapshot)
    if (!snapshot || !target) {
        return state.viewMode === 'canvas'
            ? null
            : buildCanvasViewResetState(resolveCanvasResetSplitView(state))
    }
    const rects = focusSnapshotRectMap(snapshot)

    const agentBaseline = (id: string) => rects.get(`agent:${id}`)
    const teamBaseline = (id: string) => rects.get(`team:${id}`)

    return {
        ...buildCanvasViewResetState(resolveCanvasResetSplitView(state)),
        agents: state.agents.map((agent) => {
            const baseline = agentBaseline(agent.id)
            return {
                ...agent,
                ...(baseline ? {
                    position: baseline.nodePosition,
                    width: baseline.nodeSize.width,
                    height: baseline.nodeSize.height,
                } : {}),
                hidden: snapshot.hiddenAgentIds.includes(agent.id),
            }
        }),
        teams: state.teams.map((team) => {
            const baseline = teamBaseline(team.id)
            return {
                ...team,
                ...(baseline ? {
                    position: baseline.nodePosition,
                    width: baseline.nodeSize.width,
                    height: baseline.nodeSize.height,
                } : {}),
                hidden: snapshot.hiddenTeamIds.includes(team.id),
            }
        }),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: snapshot.hiddenEditorIds.includes(editor.id) })),
        isPackageLibraryOpen: snapshot.packageLibraryOpen,
        isAssistantOpen: snapshot.assistantOpen,
        isTrackingOpen: snapshot.trackingOpen,
        isTerminalOpen: snapshot.terminalOpen,
    }
}

export function buildSyncFullscreenViewportState(
    state: StudioState,
    viewportSize: ViewportSize,
): Partial<StudioState> | null {
    if (state.viewMode === 'split') {
        return buildSplitViewLayoutState(state, state.splitView, viewportSize)
    }

    const target = resolveFocusTarget(state.focusSnapshot)
    if (!target) {
        return null
    }

    if (target.type === 'agent') {
        const agent = state.agents.find((entry) => entry.id === target.id)
        if (!agent) {
            return null
        }

        const isLayoutStable = agent.position.x === 0
            && agent.position.y === 0
            && agent.width === viewportSize.width
            && agent.height === viewportSize.height
            && agent.hidden === false

        if (isLayoutStable) {
            return null
        }

        return {
            agents: state.agents.map((entry) => (
                entry.id === target.id
                    ? {
                        ...entry,
                        hidden: false,
                        position: FOCUS_WINDOW_ORIGIN,
                        width: viewportSize.width,
                        height: viewportSize.height,
                    }
                    : entry
            )),
        }
    }

    const team = state.teams.find((entry) => entry.id === target.id)
    if (!team) {
        return null
    }

    const isLayoutStable = team.position.x === 0
        && team.position.y === 0
        && team.width === viewportSize.width
        && team.height === viewportSize.height
        && team.hidden === false

    if (isLayoutStable) {
        return null
    }

    return {
        teams: state.teams.map((entry) => (
            entry.id === target.id
                ? {
                    ...entry,
                    hidden: false,
                    position: FOCUS_WINDOW_ORIGIN,
                    width: viewportSize.width,
                    height: viewportSize.height,
                }
                : entry
        )),
    }
}

export const buildSyncFocusViewportState = buildSyncFullscreenViewportState
