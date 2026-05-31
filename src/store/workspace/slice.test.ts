import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import { createWorkspaceSlice } from './slice'
import { createAssistantSlice } from '../assistant/slice'
import { createEmptyProjectionDirtyState } from '../runtime/change-policy'

const { applyRuntimeReloadMock, deleteSessionMock, showToastMock, setHiddenMock, updateConfigMock } = vi.hoisted(() => ({
    applyRuntimeReloadMock: vi.fn(),
    deleteSessionMock: vi.fn(),
    showToastMock: vi.fn(),
    setHiddenMock: vi.fn(),
    updateConfigMock: vi.fn(),
}))

function overlaps(
    left: { x: number; y: number; width: number; height: number },
    right: { x: number; y: number; width: number; height: number },
) {
    return !(
        left.x + left.width <= right.x
        || right.x + right.width <= left.x
        || left.y + left.height <= right.y
        || right.y + right.height <= left.y
    )
}

vi.mock('../../api-core', () => ({
    setApiWorkingDirContext: vi.fn(),
}))

vi.mock('../../api-clients/chat', () => ({
    chatApi: {
        deleteSession: deleteSessionMock,
    },
}))

vi.mock('../../api-clients/opencode', () => ({
    opencodeApi: {
        applyRuntimeReload: applyRuntimeReloadMock,
    },
}))

vi.mock('../../api-clients/studio', () => ({
    studioApi: {
        updateConfig: updateConfigMock,
    },
}))

vi.mock('../../api-clients/saved-workspaces', () => ({
    savedWorkspacesApi: {
        setHidden: setHiddenMock,
    },
}))

vi.mock('../../lib/toast', () => ({
    showToast: showToastMock,
}))

function createBaseState(): StudioState {
    return {
        workspaceId: 'workspace-1',
        agents: [],
        drafts: {},
        markdownEditors: [],
        editingTarget: null,
        selectedAgentId: null,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        workspaceList: [],
        workspaceDirty: false,
        projectionDirty: createEmptyProjectionDirtyState(),
        runtimeReloadPending: true,
        theme: 'light',
        workingDir: '/tmp/workspace',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isPackageLibraryOpen: false,
        canvasTerminals: [],
        canvasCenter: null,
        layoutTeamId: null,
        chatDrafts: {},
        chatPrefixes: {},
        activeChatAgentId: null,
        sessions: [],
        selectedTeamId: null,
        teamEditorState: null,
        teams: [],
        teamThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
        isAssistantOpen: false,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
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
        clearSessionData: vi.fn(),
        unregisterBinding: vi.fn(),
        clearChatDraftMessages: vi.fn(),
        clearChatPrefixMessages: vi.fn(),
        removeSession: vi.fn(),
        listSessions: vi.fn(async () => {}),
    } as unknown as StudioState
}

function createHarness(base: StudioState = createBaseState()) {
    let state = base
    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }
    const get = () => state
    const workspaceState = createWorkspaceSlice(set, get, {} as never)
    const assistantState = createAssistantSlice(set, get, {} as never)
    state = { ...assistantState, ...workspaceState, ...state } as StudioState
    return {
        get: () => state,
    }
}

describe('workspace runtime reload', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        applyRuntimeReloadMock.mockReset()
        deleteSessionMock.mockReset()
        showToastMock.mockReset()
        setHiddenMock.mockReset().mockResolvedValue({ ok: true, id: 'workspace-1', hiddenFromList: true })
        updateConfigMock.mockReset().mockResolvedValue({ ok: true })
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => 'light'),
            setItem: vi.fn(),
        })
    })

    it('retries once when the server briefly reports a finished run as still blocked', async () => {
        const harness = createHarness()
        applyRuntimeReloadMock
            .mockResolvedValueOnce({
                applied: false,
                blocked: true,
                runningSessions: 1,
                disposedDirectories: [],
            })
            .mockResolvedValueOnce({
                applied: true,
                blocked: false,
                runningSessions: 0,
                disposedDirectories: ['/tmp/workspace'],
            })

        const promise = harness.get().applyPendingRuntimeReload()
        await vi.advanceTimersByTimeAsync(350)

        await expect(promise).resolves.toBe(true)
        expect(applyRuntimeReloadMock).toHaveBeenCalledTimes(2)
        expect(harness.get().runtimeReloadPending).toBe(false)
    })

    it('records lazy projection changes without setting runtime reload pending', () => {
        const harness = createHarness({
            ...createBaseState(),
            runtimeReloadPending: false,
        } as StudioState)

        const result = harness.get().recordStudioChange({
            kind: 'agent',
            agentIds: ['agent-1'],
            draftIds: ['instruction-draft-1'],
        })

        expect(result).toBe('lazy_projection')
        expect(harness.get().runtimeReloadPending).toBe(false)
        expect(harness.get().projectionDirty).toEqual({
            agentIds: ['agent-1'],
            teamIds: [],
            draftIds: ['instruction-draft-1'],
            workspaceWide: false,
        })
    })

    it('records Team runtime-shape changes as lazy projection dirtiness', () => {
        const harness = createHarness({
            ...createBaseState(),
            runtimeReloadPending: false,
        } as StudioState)

        const result = harness.get().recordStudioChange({
            kind: 'team',
            teamIds: ['team-1'],
            workspaceWide: true,
        })

        expect(result).toBe('lazy_projection')
        expect(harness.get().runtimeReloadPending).toBe(false)
        expect(harness.get().projectionDirty).toEqual({
            agentIds: [],
            teamIds: ['team-1'],
            draftIds: [],
            workspaceWide: true,
        })
    })

    it('spawns a new agent without overlapping an existing team window', () => {
        const harness = createHarness({
            ...createBaseState(),
            canvasCenter: { x: 1000, y: 700 },
            teams: [{
                id: 'team-1',
                name: 'Existing Team',
                position: { x: 840, y: 300 },
                width: 640,
                height: 800,
                participants: {},
                relations: [],
                createdAt: Date.now(),
            }],
        } as StudioState)

        const agentId = harness.get().addAgent('New Agent')
        const agent = harness.get().agents.find((entry) => entry.id === agentId)

        expect(agent).toBeTruthy()
        expect(overlaps(
            {
                x: agent!.position.x,
                y: agent!.position.y,
                width: agent!.width || 320,
                height: agent!.height || 400,
            },
            {
                x: 840,
                y: 300,
                width: 640,
                height: 800,
            },
        )).toBe(false)
        expect(harness.get().canvasRevealTarget).toMatchObject({
            id: agentId,
            type: 'agent',
        })
    })

    it('deletes a bound agent session when removing the agent', async () => {
        deleteSessionMock.mockResolvedValue(undefined)
        const removeSession = vi.fn()
        const clearSessionData = vi.fn()
        const unregisterBinding = vi.fn()
        const clearChatDraftMessages = vi.fn()
        const clearChatPrefixMessages = vi.fn()
        const listSessions = vi.fn(async () => {})

        const harness = createHarness({
            ...createBaseState(),
            agents: [{
                id: 'agent-1',
                name: 'Agent 1',
                position: { x: 0, y: 0 },
                scope: 'shared',
                model: null,
                instructionRef: null,
                skillRefs: [],
                mcpServerNames: [],
            }],
            sessions: [{ id: 'session-1', title: 'Agent 1' }],
            chatKeyToSession: { 'agent-1': 'session-1' },
            sessionToChatKey: { 'session-1': 'agent-1' },
            clearSessionData,
            unregisterBinding,
            clearChatDraftMessages,
            clearChatPrefixMessages,
            removeSession,
            listSessions,
        } as StudioState)

        harness.get().removeAgent('agent-1')
        await Promise.resolve()
        await Promise.resolve()

        expect(deleteSessionMock).toHaveBeenCalledWith('session-1')
        expect(clearSessionData).toHaveBeenCalledWith('session-1')
        expect(unregisterBinding).toHaveBeenCalledWith('agent-1')
        expect(removeSession).toHaveBeenCalledWith('session-1')
    })

    it('hides a non-active workspace from the list without resetting the current workspace state', async () => {
        const listWorkspaces = vi.fn(async () => {})
        const cleanupRealtimeEvents = vi.fn()
        const harness = createHarness({
            ...createBaseState(),
            workspaceId: 'workspace-1',
            workingDir: '/tmp/workspace-a',
            listWorkspaces,
            cleanupRealtimeEvents,
        } as StudioState)

        await harness.get().closeWorkspace('workspace-2')

        expect(setHiddenMock).toHaveBeenCalledWith('workspace-2', true)
        expect(listWorkspaces).toHaveBeenCalled()
        expect(cleanupRealtimeEvents).not.toHaveBeenCalled()
        expect(harness.get().workspaceId).toBe('workspace-1')
        expect(harness.get().workingDir).toBe('/tmp/workspace-a')
        expect(updateConfigMock).not.toHaveBeenCalled()
    })
})

describe('workspace visibility toggles', () => {
    it('keeps focus mode active when toggling another agent visibility', () => {
        const harness = createHarness({
            ...createBaseState(),
            agents: [
                {
                    id: 'agent-1',
                    name: 'Alpha',
                    position: { x: 0, y: 0 },
                    width: 960,
                    height: 720,
                    hidden: false,
                    scope: 'shared',
                    model: null,
                    instructionRef: null,
                    skillRefs: [],
                    mcpServerNames: [],
                },
                {
                    id: 'agent-2',
                    name: 'Beta',
                    position: { x: 220, y: 0 },
                    width: 320,
                    height: 400,
                    hidden: true,
                    scope: 'shared',
                    model: null,
                    instructionRef: null,
                    skillRefs: [],
                    mcpServerNames: [],
                },
            ],
            focusSnapshot: {
                nodeId: 'agent-1',
                type: 'agent',
                nodePosition: { x: 0, y: 0 },
                nodeSize: { width: 320, height: 400 },
                hiddenAgentIds: [],
                hiddenTeamIds: [],
                hiddenEditorIds: [],
                hiddenTerminalIds: [],
                packageLibraryOpen: true,
                assistantOpen: false,
                trackingOpen: false,
                terminalOpen: false,
            },
        } as StudioState)

        harness.get().toggleAgentVisibility('agent-2')

        expect(harness.get().focusSnapshot).toMatchObject({
            nodeId: 'agent-1',
            hiddenAgentIds: ['agent-2'],
        })
        expect(harness.get().agents.find((entry) => entry.id === 'agent-2')?.hidden).toBe(true)
    })
})

describe('workspace side panels', () => {
    it('opens workspace tracking without dirtying the workspace and closes assistant', () => {
        const harness = createHarness({
            ...createBaseState(),
            isAssistantOpen: true,
            workspaceDirty: false,
        } as StudioState)

        harness.get().setTrackingOpen(true)

        expect(harness.get().isTrackingOpen).toBe(true)
        expect(harness.get().isAssistantOpen).toBe(false)
        expect(harness.get().workspaceDirty).toBe(false)
    })

    it('opens assistant by closing workspace tracking', () => {
        const harness = createHarness({
            ...createBaseState(),
            isTrackingOpen: true,
            isAssistantOpen: false,
        } as StudioState)

        harness.get().toggleAssistant()

        expect(harness.get().isAssistantOpen).toBe(true)
        expect(harness.get().isTrackingOpen).toBe(false)
    })

    it('switches workspace modes without dirtying the workspace', () => {
        const harness = createHarness({
            ...createBaseState(),
            isTrackingOpen: true,
            isAssistantOpen: true,
            isTerminalOpen: true,
            isPackageLibraryOpen: true,
            workspaceDirty: false,
        } as StudioState)

        harness.get().setWorkspaceMode('manage')

        expect(harness.get().workspaceMode).toBe('manage')
        expect(harness.get().isTrackingOpen).toBe(false)
        expect(harness.get().isAssistantOpen).toBe(false)
        expect(harness.get().isTerminalOpen).toBe(false)
        expect(harness.get().isPackageLibraryOpen).toBe(false)
        expect(harness.get().workspaceDirty).toBe(false)

        harness.get().setWorkspaceMode('import')

        expect(harness.get().workspaceMode).toBe('import')
        expect(harness.get().isAssistantOpen).toBe(false)
        expect(harness.get().isTerminalOpen).toBe(false)
        expect(harness.get().workspaceDirty).toBe(false)

        harness.get().setWorkspaceMode('studio-agent')

        expect(harness.get().workspaceMode).toBe('studio-agent')
        expect(harness.get().isAssistantOpen).toBe(false)
        expect(harness.get().isTerminalOpen).toBe(false)
        expect(harness.get().workspaceDirty).toBe(false)

        harness.get().setWorkspaceMode('manage')

        expect(harness.get().workspaceMode).toBe('manage')
    })
})
