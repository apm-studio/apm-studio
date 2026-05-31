import { isFocusTarget, isSplitViewTarget } from '../../lib/focus-utils'
import type {
    FocusSnapshot,
    SplitViewPane,
    SplitViewState,
    WorkspaceMode,
    WorkspaceViewMode,
} from '../../store/workspace/types'

export type AgentFrameEditingTarget = { type: 'agent'; id: string } | null

export type AgentFrameSurfaceState = {
    isSelected: boolean
    isFullView: boolean
    splitPane: SplitViewPane | null
    isSplitPane: boolean
    isFullscreenSurface: boolean
    isManageMode: boolean
    hideFocusControl: boolean
    isEditMode: boolean
    isTeamEditMode: boolean
    shouldShowEditPanel: boolean
}

export type AgentFrameMcpBindingRow = {
    placeholderName: string
    serverName: string | null
}

export type AgentFrameMcpBindingOption = {
    name: string
    disabled: boolean
}

export function buildAgentFrameSurfaceState(input: {
    id: string
    selectedAgentId: string | null
    editingTarget: AgentFrameEditingTarget
    focusSnapshot: FocusSnapshot | null
    viewMode: WorkspaceViewMode
    workspaceMode: WorkspaceMode
    splitView: SplitViewState
    teamEditConnectVisible?: boolean
}): AgentFrameSurfaceState {
    const isSelected = input.selectedAgentId === input.id
    const isFullView = input.viewMode === 'full' && isFocusTarget(input.focusSnapshot, input.id, 'agent')
    const splitPane = input.splitView.panes.find((pane) => pane.type === 'agent' && pane.nodeId === input.id) || null
    const isSplitPane = isSplitViewTarget(input.viewMode, input.splitView, input.id, 'agent')
    const isFullscreenSurface = isFullView || isSplitPane
    const isManageMode = input.workspaceMode === 'studio-agent' && !isFullscreenSurface
    const hideFocusControl = isManageMode || (input.workspaceMode === 'studio-agent' && isFullView)
    const isEditMode = input.editingTarget?.type === 'agent' && input.editingTarget.id === input.id
    const isTeamEditMode = !!input.teamEditConnectVisible

    return {
        isSelected,
        isFullView,
        splitPane,
        isSplitPane,
        isFullscreenSurface,
        isManageMode,
        hideFocusControl,
        isEditMode,
        isTeamEditMode,
        shouldShowEditPanel: isManageMode || isEditMode || isTeamEditMode,
    }
}

export function buildAgentFrameShellClassName(input: {
    teamEditParticipant?: boolean
    teamEditDimmed?: boolean
}) {
    return [
        'agent-node-shell',
        input.teamEditParticipant ? 'agent-node-shell--team-participant' : '',
        input.teamEditDimmed ? 'agent-node-shell--team-dimmed' : '',
    ].filter(Boolean).join(' ')
}

export function buildAgentFrameCanvasClassName(input: {
    isFullView: boolean
    isSplitPane: boolean
}) {
    return [
        'nowheel',
        input.isFullView ? 'canvas-frame--focused' : '',
        input.isSplitPane ? 'canvas-frame--split-pane' : '',
    ].filter(Boolean).join(' ')
}

export function buildAgentFrameDragHandle(input: {
    splitPane: SplitViewPane | null
    id: string
    name: string
}) {
    if (!input.splitPane) return undefined
    return {
        id: `split-pane-frame:${input.splitPane.paneId}`,
        data: {
            kind: 'agent',
            source: 'split-pane',
            paneId: input.splitPane.paneId,
            nodeId: input.id,
            nodeType: 'agent',
            label: input.name,
            name: input.name,
        },
        title: 'Move Split View pane',
    }
}

export function buildAgentFrameMcpBindingRows(
    declaredMcpServerNames: string[] | undefined,
    mcpBindingMap: Record<string, string> | undefined,
): AgentFrameMcpBindingRow[] {
    return (declaredMcpServerNames || []).map((placeholderName) => ({
        placeholderName,
        serverName: mcpBindingMap?.[placeholderName] || null,
    }))
}

export function buildAgentFrameMcpBindingOptions(
    mcpServers: Array<{ name: string }>,
): AgentFrameMcpBindingOption[] {
    return mcpServers.map((server) => ({ name: server.name, disabled: false }))
}
