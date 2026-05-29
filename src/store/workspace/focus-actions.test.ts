import { describe, expect, it } from 'vitest'
import {
    TEAM_DEFAULT_EXPANDED_HEIGHT,
    TEAM_DEFAULT_WIDTH,
} from '../../lib/team-layout'
import { createAgentNode, AGENT_DEFAULT_HEIGHT } from '../../lib/agents'
import {
    addSplitViewPaneImpl,
    enterEmptyFullViewImpl,
    enterEmptySplitViewImpl,
    enterFocusModeImpl,
    enterSplitViewImpl,
    exitFocusModeImpl,
    insertSplitViewPaneImpl,
    moveSplitViewPaneImpl,
    removeSplitViewPaneImpl,
    replaceSplitViewPaneImpl,
    resizeSplitViewBoundaryImpl,
    switchFocusTargetImpl,
} from './focus-actions'
import {
    buildExitFocusModeState,
    buildSyncFocusViewportState,
} from './focus-mode-state'
import { createEmptySplitViewState, createSplitViewPane, resolveSplitDropIntent } from '../../lib/focus-utils'
import { createMarkdownEditorImpl } from './markdown-editor-actions'
import type { StudioState } from '../types'

function createTestState(): StudioState {
    return {
        agents: [
            createAgentNode({ id: 'agent-1', name: 'Alpha', x: 0, y: 0 }),
            createAgentNode({ id: 'agent-2', name: 'Beta', x: 240, y: 0 }),
        ],
        teams: [],
        markdownEditors: [],
        drafts: {},
        workingDir: '',
        workspaceId: null,
        selectedAgentId: null,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        viewMode: 'canvas',
        splitView: createEmptySplitViewState(),
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        workspaceList: [],
        workspaceDirty: false,
        theme: 'dark',
        isTerminalOpen: true,
        isTrackingOpen: false,
        isPackageLibraryOpen: true,
        canvasTerminals: [],
        canvasCenter: null,
        layoutTeamId: null,
        editingTarget: null,
        selectedTeamId: null,
        teamEditorState: null,
        teamThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
        chatDrafts: {},
        chatPrefixes: {},
        activeChatAgentId: null,
        sessions: [],
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionReverts: {},
        isAssistantOpen: true,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
        recordStudioChange: (() => 'lazy_projection') as StudioState['recordStudioChange'],
    } as unknown as StudioState
}

function createStateHarness(initialState = createTestState()) {
    let state = initialState

    return {
        get: () => state,
        set: (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            const nextPartial = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...nextPartial }
        },
        read: () => state,
    }
}

describe('workspace focus actions', () => {
    it('records the focused node id and closes side panels when entering agent focus', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 900, height: 700 })

        const state = harness.read()
        expect(state.focusSnapshot?.nodeId).toBe('agent-1')
        expect(state.focusSnapshot?.type).toBe('agent')
        expect(state.viewMode).toBe('full')
        expect(state.isPackageLibraryOpen).toBe(false)
        expect(state.isAssistantOpen).toBe(false)
        expect(state.isTrackingOpen).toBe(false)
        expect(state.isTerminalOpen).toBe(false)
        expect(state.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            hidden: false,
            width: 900,
            height: 700,
        })
        expect(state.agents.find((entry) => entry.id === 'agent-2')?.hidden).toBe(true)
    })

    it('restores agent size from the snapshot when exiting focus mode', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 900, height: 700 })

        exitFocusModeImpl(harness.get, harness.set)

        const state = harness.read()
        expect(state.focusSnapshot).toBeNull()
        expect(state.viewMode).toBe('canvas')
        expect(state.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            hidden: false,
            width: 320,
            height: AGENT_DEFAULT_HEIGHT,
        })
        expect(state.isPackageLibraryOpen).toBe(true)
        expect(state.isAssistantOpen).toBe(true)
        expect(state.isTrackingOpen).toBe(false)
        expect(state.isTerminalOpen).toBe(true)
    })

    it('closes and restores workspace tracking around focus mode', () => {
        const harness = createStateHarness({
            ...createTestState(),
            isAssistantOpen: false,
            isTrackingOpen: true,
        } as StudioState)

        enterFocusModeImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 900, height: 700 })

        expect(harness.read().isTrackingOpen).toBe(false)
        expect(harness.read().focusSnapshot).toMatchObject({
            assistantOpen: false,
            trackingOpen: true,
        })

        exitFocusModeImpl(harness.get, harness.set)

        expect(harness.read().isAssistantOpen).toBe(false)
        expect(harness.read().isTrackingOpen).toBe(true)
    })

    it('switches focus targets by restoring the baseline layout before refocusing', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 900, height: 700 })

        switchFocusTargetImpl(harness.get, harness.set, 'agent-2', 'agent')

        const state = harness.read()
        expect(state.focusSnapshot?.nodeId).toBe('agent-2')
        expect(state.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            hidden: true,
            position: { x: 0, y: 0 },
            width: 320,
            height: AGENT_DEFAULT_HEIGHT,
        })
        expect(state.agents.find((entry) => entry.id === 'agent-2')).toMatchObject({
            hidden: false,
            width: 900,
            height: 700,
        })
    })

    it('switches from an team focus target back to a agent using the restored baseline state', () => {
        const harness = createStateHarness({
            ...createTestState(),
            teams: [{
                id: 'team-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterFocusModeImpl(harness.get, harness.set, 'team-1', 'team', { width: 1000, height: 760 })
        switchFocusTargetImpl(harness.get, harness.set, 'agent-2', 'agent')

        const state = harness.read()
        expect(state.focusSnapshot).toMatchObject({
            nodeId: 'agent-2',
            type: 'agent',
            packageLibraryOpen: true,
            assistantOpen: true,
            trackingOpen: false,
            terminalOpen: true,
        })
        expect(state.agents.find((entry) => entry.id === 'agent-2')).toMatchObject({
            hidden: false,
            width: 1000,
            height: 760,
        })
        expect(state.teams.find((entry) => entry.id === 'team-1')).toMatchObject({
            hidden: true,
            width: TEAM_DEFAULT_WIDTH,
            height: TEAM_DEFAULT_EXPANDED_HEIGHT,
            position: { x: 220, y: 160 },
        })
    })

    it('builds an exit patch that restores team position and side panels', () => {
        const harness = createStateHarness({
            ...createTestState(),
            teams: [{
                id: 'team-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterFocusModeImpl(harness.get, harness.set, 'team-1', 'team', { width: 1000, height: 760 })

        const patch = buildExitFocusModeState(harness.read())

        expect(patch).toMatchObject({
            focusSnapshot: null,
            isPackageLibraryOpen: true,
            isAssistantOpen: true,
            isTerminalOpen: true,
        })
        expect((patch?.teams as StudioState['teams'])[0]).toMatchObject({
            id: 'team-1',
            hidden: false,
            position: { x: 220, y: 160 },
            width: TEAM_DEFAULT_WIDTH,
            height: TEAM_DEFAULT_EXPANDED_HEIGHT,
        })
    })

    it('exits focus mode before creating a markdown editor', () => {
        const harness = createStateHarness()
        const markdownEditorIdCounter = { value: 0 }

        enterFocusModeImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 960, height: 720 })

        createMarkdownEditorImpl(
            harness.get,
            harness.set,
            markdownEditorIdCounter,
            (prefix) => `${prefix}-1`,
            'instruction',
        )

        const state = harness.read()
        expect(state.focusSnapshot).toBeNull()
        expect(state.selectedMarkdownEditorId).toBe('markdown-editor-1')
        expect(state.isPackageLibraryOpen).toBe(true)
        expect(state.isAssistantOpen).toBe(true)
        expect(state.isTrackingOpen).toBe(false)
        expect(state.isTerminalOpen).toBe(true)
        expect(state.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            hidden: false,
            width: 320,
            height: AGENT_DEFAULT_HEIGHT,
        })
        expect(state.markdownEditors).toHaveLength(1)
        expect(state.markdownEditors[0]).toMatchObject({
            id: 'markdown-editor-1',
            hidden: false,
        })
    })

    it('keeps the focused agent pinned to the canvas origin while syncing viewport size', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 900, height: 700 })
        harness.set((state) => ({
            agents: state.agents.map((entry) => (
                entry.id === 'agent-1'
                    ? { ...entry, hidden: true, position: { x: 48, y: 36 }, width: 860, height: 640 }
                    : entry
            )),
        }))

        const patch = buildSyncFocusViewportState(harness.read(), { width: 960, height: 720 })

        expect((patch?.agents as StudioState['agents'])[0]).toMatchObject({
            id: 'agent-1',
            hidden: false,
            position: { x: 0, y: 0 },
            width: 960,
            height: 720,
        })
    })

    it('enters and exits empty Full View without requiring a selected node', () => {
        const harness = createStateHarness()

        enterEmptyFullViewImpl(harness.get, harness.set)

        expect(harness.read()).toMatchObject({
            viewMode: 'full',
            focusSnapshot: null,
            selectedAgentId: null,
            selectedTeamId: null,
        })
        expect(harness.read().splitView.panes).toEqual([])

        exitFocusModeImpl(harness.get, harness.set)

        expect(harness.read()).toMatchObject({
            viewMode: 'canvas',
            focusSnapshot: null,
        })
    })

    it('lets empty Split View seed its first pane from a workspace-node drop', () => {
        const harness = createStateHarness()

        enterEmptySplitViewImpl(harness.get, harness.set)

        expect(harness.read()).toMatchObject({
            viewMode: 'split',
            focusSnapshot: null,
            selectedAgentId: null,
            selectedTeamId: null,
        })
        expect(harness.read().splitView.panes).toEqual([])

        insertSplitViewPaneImpl(harness.get, harness.set, 'agent-1', 'agent', 0, { width: 900, height: 700 })

        const state = harness.read()
        expect(state.viewMode).toBe('split')
        expect(state.focusSnapshot).toMatchObject({
            nodeId: 'agent-1',
            type: 'agent',
        })
        expect(state.splitView.panes.map((pane) => pane.paneId)).toEqual(['agent:agent-1'])
        expect(state.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            hidden: false,
            position: { x: 0, y: 0 },
            width: 900,
            height: 700,
        })
    })

    it('restores a focused layout before entering empty Split View', () => {
        const harness = createStateHarness()

        enterFocusModeImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 900, height: 700 })
        enterEmptySplitViewImpl(harness.get, harness.set)

        const state = harness.read()
        expect(state).toMatchObject({
            viewMode: 'split',
            focusSnapshot: null,
            selectedAgentId: null,
            selectedTeamId: null,
        })
        expect(state.splitView.panes).toEqual([])
        expect(state.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            hidden: false,
            position: { x: 0, y: 0 },
            width: 320,
            height: AGENT_DEFAULT_HEIGHT,
        })
        expect(state.agents.find((entry) => entry.id === 'agent-2')?.hidden).toBe(false)
    })

    it('lays out selected Team and Agent panes in Split View without losing baseline sizes', () => {
        const harness = createStateHarness({
            ...createTestState(),
            selectedTeamId: 'team-1',
            teams: [{
                id: 'team-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterSplitViewImpl(harness.get, harness.set, 'team-1', 'team', { width: 1000, height: 700 })
        addSplitViewPaneImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 1000, height: 700 })

        const splitState = harness.read()
        expect(splitState.viewMode).toBe('split')
        expect(splitState.splitView.panes).toHaveLength(2)
        expect(splitState.teams.find((entry) => entry.id === 'team-1')).toMatchObject({
            hidden: false,
            position: { x: 0, y: 0 },
            width: 496,
            height: 700,
        })
        expect(splitState.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            hidden: false,
            position: { x: 504, y: 0 },
            width: 496,
            height: 700,
        })
        expect(splitState.agents.find((entry) => entry.id === 'agent-2')?.hidden).toBe(true)

        exitFocusModeImpl(harness.get, harness.set)

        const restored = harness.read()
        expect(restored.viewMode).toBe('canvas')
        expect(restored.teams.find((entry) => entry.id === 'team-1')).toMatchObject({
            hidden: false,
            position: { x: 220, y: 160 },
            width: TEAM_DEFAULT_WIDTH,
            height: TEAM_DEFAULT_EXPANDED_HEIGHT,
        })
        expect(restored.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            hidden: false,
            position: { x: 0, y: 0 },
            width: 320,
            height: AGENT_DEFAULT_HEIGHT,
        })
    })

    it('removes panes from Split View while staying in fullscreen split mode', () => {
        const harness = createStateHarness()

        enterSplitViewImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 1000, height: 700 })
        addSplitViewPaneImpl(harness.get, harness.set, 'agent-2', 'agent', { width: 1000, height: 700 })

        removeSplitViewPaneImpl(harness.get, harness.set, 'agent:agent-1', { width: 1000, height: 700 })

        const state = harness.read()
        expect(state.viewMode).toBe('split')
        expect(state.splitView.panes.map((pane) => pane.nodeId)).toEqual(['agent-2'])
        expect(state.agents.find((entry) => entry.id === 'agent-1')?.hidden).toBe(true)
        expect(state.agents.find((entry) => entry.id === 'agent-2')).toMatchObject({
            hidden: false,
            position: { x: 0, y: 0 },
            width: 1000,
            height: 700,
        })
    })

    it('replaces a Split View pane with another workspace node', () => {
        const harness = createStateHarness({
            ...createTestState(),
            teams: [{
                id: 'team-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterSplitViewImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 1000, height: 700 })
        addSplitViewPaneImpl(harness.get, harness.set, 'agent-2', 'agent', { width: 1000, height: 700 })

        replaceSplitViewPaneImpl(harness.get, harness.set, 'agent:agent-2', 'team-1', 'team', { width: 1000, height: 700 })

        const state = harness.read()
        expect(state.splitView.panes.map((pane) => pane.paneId)).toEqual(['agent:agent-1', 'team:team-1'])
        expect(state.splitView.activePaneId).toBe('team:team-1')
        expect(state.selectedTeamId).toBe('team-1')
        expect(state.selectedAgentId).toBeNull()
        expect(state.teams.find((entry) => entry.id === 'team-1')).toMatchObject({
            hidden: false,
            position: { x: 504, y: 0 },
            width: 496,
            height: 700,
        })
        expect(state.agents.find((entry) => entry.id === 'agent-2')?.hidden).toBe(true)
    })

    it('lays out Split View rows with independent column counts', () => {
        const harness = createStateHarness({
            ...createTestState(),
            teams: [{
                id: 'team-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterSplitViewImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 1000, height: 700 })
        insertSplitViewPaneImpl(
            harness.get,
            harness.set,
            'agent-2',
            'agent',
            { rowIndex: 0, columnIndex: 1, rowMode: 'existing' },
            { width: 1000, height: 700 },
        )
        insertSplitViewPaneImpl(
            harness.get,
            harness.set,
            'team-1',
            'team',
            { rowIndex: 1, columnIndex: 0, rowMode: 'new' },
            { width: 1000, height: 700 },
        )

        const state = harness.read()
        expect(state.splitView.rows).toEqual([
            ['agent:agent-1', 'agent:agent-2'],
            ['team:team-1'],
        ])

        expect(state.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            position: { x: 0, y: 0 },
            width: 496,
            height: 346,
        })
        expect(state.agents.find((entry) => entry.id === 'agent-2')).toMatchObject({
            position: { x: 504, y: 0 },
            width: 496,
            height: 346,
        })
        expect(state.teams.find((entry) => entry.id === 'team-1')).toMatchObject({
            position: { x: 0, y: 354 },
            width: 1000,
            height: 346,
        })
    })

    it('restores saved Split View rows after switching through Canvas and empty Full View', () => {
        const harness = createStateHarness({
            ...createTestState(),
            teams: [{
                id: 'team-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterSplitViewImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 1000, height: 700 })
        insertSplitViewPaneImpl(
            harness.get,
            harness.set,
            'agent-2',
            'agent',
            { rowIndex: 0, columnIndex: 1, rowMode: 'existing' },
            { width: 1000, height: 700 },
        )
        insertSplitViewPaneImpl(
            harness.get,
            harness.set,
            'team-1',
            'team',
            { rowIndex: 1, columnIndex: 0, rowMode: 'new' },
            { width: 1000, height: 700 },
        )

        const savedRows = harness.read().splitView.rows
        const savedPaneIds = harness.read().splitView.panes.map((pane) => pane.paneId)

        exitFocusModeImpl(harness.get, harness.set)

        expect(harness.read()).toMatchObject({
            viewMode: 'canvas',
            focusSnapshot: null,
        })
        expect(harness.read().splitView.rows).toEqual(savedRows)
        expect(harness.read().splitView.panes.map((pane) => pane.paneId)).toEqual(savedPaneIds)

        enterEmptyFullViewImpl(harness.get, harness.set)
        enterSplitViewImpl(harness.get, harness.set, undefined, undefined, { width: 1000, height: 700 })

        const restored = harness.read()
        expect(restored.viewMode).toBe('split')
        expect(restored.splitView.rows).toEqual(savedRows)
        expect(restored.splitView.panes.map((pane) => pane.paneId)).toEqual(savedPaneIds)
        expect(restored.teams.find((entry) => entry.id === 'team-1')).toMatchObject({
            hidden: false,
            position: { x: 0, y: 354 },
            width: 1000,
            height: 346,
        })
    })

    it('resizes Split View row and column boundaries with persistent weights', () => {
        const harness = createStateHarness({
            ...createTestState(),
            teams: [{
                id: 'team-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterSplitViewImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 1000, height: 700 })
        insertSplitViewPaneImpl(
            harness.get,
            harness.set,
            'agent-2',
            'agent',
            { rowIndex: 0, columnIndex: 1, rowMode: 'existing' },
            { width: 1000, height: 700 },
        )
        insertSplitViewPaneImpl(
            harness.get,
            harness.set,
            'team-1',
            'team',
            { rowIndex: 1, columnIndex: 0, rowMode: 'new' },
            { width: 1000, height: 700 },
        )

        resizeSplitViewBoundaryImpl(harness.get, harness.set, 'column', 0, 0, 120, { width: 1000, height: 700 })
        resizeSplitViewBoundaryImpl(harness.get, harness.set, 'row', 0, 0, 80, { width: 1000, height: 700 })

        const resized = harness.read()
        expect(resized.splitView.rowWeights[0]).toBeGreaterThan(resized.splitView.rowWeights[1])
        expect(resized.splitView.columnWeights[0][0]).toBeGreaterThan(resized.splitView.columnWeights[0][1])
        expect(resized.agents.find((entry) => entry.id === 'agent-1')).toMatchObject({
            position: { x: 0, y: 0 },
            width: 616,
            height: 426,
        })
        expect(resized.agents.find((entry) => entry.id === 'agent-2')).toMatchObject({
            position: { x: 624, y: 0 },
            width: 376,
            height: 426,
        })
        expect(resized.teams.find((entry) => entry.id === 'team-1')).toMatchObject({
            position: { x: 0, y: 434 },
            width: 1000,
            height: 266,
        })

        exitFocusModeImpl(harness.get, harness.set)
        enterSplitViewImpl(harness.get, harness.set, undefined, undefined, { width: 1000, height: 700 })

        expect(harness.read().splitView.rowWeights).toEqual(resized.splitView.rowWeights)
        expect(harness.read().splitView.columnWeights).toEqual(resized.splitView.columnWeights)
    })

    it('derives Split View row placement from pointer position', () => {
        const panes = [createSplitViewPane('agent-1', 'agent')]
        const rightIntent = resolveSplitDropIntent({
            point: { x: 890, y: 350 },
            panes,
            viewportSize: { width: 900, height: 700 },
            columns: 1,
            canPlaceAtEdge: true,
        })

        expect(rightIntent).toMatchObject({
            direction: 'right',
            targetIndex: 1,
            placement: {
                rowIndex: 0,
                columnIndex: 1,
                rowMode: 'existing',
            },
        })

        const bottomIntent = resolveSplitDropIntent({
            point: { x: 450, y: 690 },
            panes,
            viewportSize: { width: 900, height: 700 },
            columns: 1,
            canPlaceAtEdge: true,
        })

        expect(bottomIntent).toMatchObject({
            direction: 'bottom',
            targetIndex: 1,
            placement: {
                rowIndex: 1,
                columnIndex: 0,
                rowMode: 'new',
            },
        })
    })

    it('inserts and reorders Split View panes by row placement', () => {
        const harness = createStateHarness({
            ...createTestState(),
            teams: [{
                id: 'team-1',
                name: 'Control',
                position: { x: 220, y: 160 },
                width: TEAM_DEFAULT_WIDTH,
                height: TEAM_DEFAULT_EXPANDED_HEIGHT,
                participants: {},
                relations: [],
                createdAt: Date.now(),
                hidden: false,
            }],
        } as StudioState)

        enterSplitViewImpl(harness.get, harness.set, 'agent-1', 'agent', { width: 1000, height: 700 })
        addSplitViewPaneImpl(harness.get, harness.set, 'agent-2', 'agent', { width: 1000, height: 700 })
        insertSplitViewPaneImpl(harness.get, harness.set, 'team-1', 'team', 1, { width: 1000, height: 700 })

        expect(harness.read().splitView.panes.map((pane) => pane.paneId)).toEqual([
            'agent:agent-1',
            'team:team-1',
            'agent:agent-2',
        ])

        moveSplitViewPaneImpl(harness.get, harness.set, 'agent:agent-2', 0, { width: 1000, height: 700 })

        const state = harness.read()
        expect(state.splitView.panes.map((pane) => pane.paneId)).toEqual([
            'agent:agent-2',
            'agent:agent-1',
            'team:team-1',
        ])
        expect(state.splitView.rows).toEqual([[
            'agent:agent-2',
            'agent:agent-1',
            'team:team-1',
        ]])
        expect(state.splitView.activePaneId).toBe('agent:agent-2')
        expect(state.agents.find((entry) => entry.id === 'agent-2')).toMatchObject({
            position: { x: 0, y: 0 },
            width: 328,
            height: 700,
        })
    })
})
