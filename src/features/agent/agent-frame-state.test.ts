import { describe, expect, it } from 'vitest'
import type { FocusSnapshot, SplitViewState } from '../../store/workspace/types'
import {
    buildAgentFrameCanvasClassName,
    buildAgentFrameDragHandle,
    buildAgentFrameMcpBindingOptions,
    buildAgentFrameMcpBindingRows,
    buildAgentFrameShellClassName,
    buildAgentFrameSurfaceState,
} from './agent-frame-state'

function focusSnapshot(nodeId = 'agent-1'): FocusSnapshot {
    return {
        nodeId,
        type: 'agent',
        hiddenAgentIds: [],
        hiddenTeamIds: [],
        hiddenEditorIds: [],
        hiddenTerminalIds: [],
        nodeSize: { width: 320, height: 400 },
        packageLibraryOpen: false,
        assistantOpen: false,
        trackingOpen: false,
        terminalOpen: false,
    }
}

function splitView(): SplitViewState {
    return {
        panes: [
            { paneId: 'agent:agent-1', nodeId: 'agent-1', type: 'agent' },
            { paneId: 'team:team-1', nodeId: 'team-1', type: 'team' },
        ],
        activePaneId: 'agent:agent-1',
        rows: [['agent:agent-1', 'team:team-1']],
        rowWeights: [1],
        columnWeights: [[1, 1]],
        columns: 2,
    }
}

describe('agent frame state', () => {
    it('resolves focused Studio Agent run surface and hides redundant focus control', () => {
        const state = buildAgentFrameSurfaceState({
            id: 'agent-1',
            selectedAgentId: 'agent-1',
            editingTarget: null,
            focusSnapshot: focusSnapshot(),
            viewMode: 'full',
            workspaceMode: 'studio-agent',
            splitView: { ...splitView(), panes: [] },
        })

        expect(state).toMatchObject({
            isSelected: true,
            isFullView: true,
            isSplitPane: false,
            isFullscreenSurface: true,
            isManageMode: false,
            hideFocusControl: true,
            shouldShowEditPanel: false,
        })
    })

    it('uses Studio Agent canvas as edit surface outside fullscreen layouts', () => {
        const state = buildAgentFrameSurfaceState({
            id: 'agent-1',
            selectedAgentId: null,
            editingTarget: null,
            focusSnapshot: null,
            viewMode: 'canvas',
            workspaceMode: 'studio-agent',
            splitView: { ...splitView(), panes: [] },
        })

        expect(state.isManageMode).toBe(true)
        expect(state.shouldShowEditPanel).toBe(true)
        expect(state.hideFocusControl).toBe(true)
    })

    it('resolves split pane drag handle metadata', () => {
        const state = buildAgentFrameSurfaceState({
            id: 'agent-1',
            selectedAgentId: null,
            editingTarget: null,
            focusSnapshot: null,
            viewMode: 'split',
            workspaceMode: 'studio-agent',
            splitView: splitView(),
        })

        expect(state.isSplitPane).toBe(true)
        expect(buildAgentFrameDragHandle({
            splitPane: state.splitPane,
            id: 'agent-1',
            name: 'Research Agent',
        })).toEqual({
            id: 'split-pane-frame:agent:agent-1',
            data: {
                kind: 'agent',
                source: 'split-pane',
                paneId: 'agent:agent-1',
                nodeId: 'agent-1',
                nodeType: 'agent',
                label: 'Research Agent',
                name: 'Research Agent',
            },
            title: 'Move Split View pane',
        })
    })

    it('builds stable CSS class lists', () => {
        expect(buildAgentFrameShellClassName({
            teamEditParticipant: true,
            teamEditDimmed: true,
        })).toBe('agent-node-shell agent-node-shell--team-participant agent-node-shell--team-dimmed')
        expect(buildAgentFrameCanvasClassName({
            isFullView: true,
            isSplitPane: true,
        })).toBe('nowheel canvas-frame--focused canvas-frame--split-pane')
    })

    it('builds MCP binding rows and options', () => {
        expect(buildAgentFrameMcpBindingRows(['github', 'drive'], { github: 'github-main' })).toEqual([
            { placeholderName: 'github', serverName: 'github-main' },
            { placeholderName: 'drive', serverName: null },
        ])
        expect(buildAgentFrameMcpBindingOptions([{ name: 'github-main' }])).toEqual([
            { name: 'github-main', disabled: false },
        ])
    })
})
