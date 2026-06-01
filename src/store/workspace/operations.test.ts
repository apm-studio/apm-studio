import { afterEach, describe, expect, it, vi } from 'vitest'
import { studioApi } from '../../api-clients/studio'
import { savedWorkspacesApi } from '../../api-clients/saved-workspaces'
import { StudioApiError } from '../../lib/api-errors'
import type { StudioState } from '../types'
import { loadWorkspace, newWorkspace, saveWorkspace } from './operations'

const { showToastMock } = vi.hoisted(() => ({
    showToastMock: vi.fn(),
}))

vi.mock('../../lib/toast', () => ({
    showToast: showToastMock,
}))

function createWorkspaceState(): StudioState {
    return {
        workspaceId: 'workspace-old',
        workspaceList: [],
        workingDir: '/tmp/old-workspace',
        agents: [],
        teams: [],
        drafts: {},
        markdownEditors: [],
        canvasTerminals: [{
            id: 'canvas-term-1',
            title: 'Terminal 1',
            position: { x: 160, y: 120 },
            width: 640,
            height: 420,
            sessionId: 'sess-old',
            connected: true,
        }],
        editingTarget: null,
        selectedAgentId: null,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        workspaceMode: 'export',
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        workspaceDirty: false,
        runtimeReloadPending: false,
        theme: 'dark',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isPackageLibraryOpen: false,
        canvasCenter: null,
        layoutTeamId: null,
        chatDrafts: {},
        chatPrefixes: {},
        activeChatAgentId: null,
        sessions: [],
        selectedTeamId: null,
        teamEditorState: null,
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
        cleanupRealtimeEvents: vi.fn(),
        initRealtimeEvents: vi.fn(),
        loadDraftsFromDisk: vi.fn(),
        loadWorkspace: vi.fn(),
    } as unknown as StudioState
}

function createHarness(initialState = createWorkspaceState()) {
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

describe('workspace operations', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('clears canvas terminals without changing workflow mode when opening a brand-new workspace', async () => {
        const harness = createHarness()

        vi.spyOn(studioApi, 'pickDirectory').mockResolvedValue({ path: '/tmp/new-workspace' })
        vi.spyOn(savedWorkspacesApi, 'list').mockResolvedValue([])
        vi.spyOn(studioApi, 'activate').mockResolvedValue({ ok: true, activeProjectDir: '/tmp/new-workspace' })

        await newWorkspace(harness.get, harness.set)

        expect(harness.read().workingDir).toBe('/tmp/new-workspace')
        expect(harness.read().canvasTerminals).toEqual([])
        expect(harness.read().isTrackingOpen).toBe(false)
        expect(harness.read().workspaceMode).toBe('export')
        expect(harness.read().workspaceDirty).toBe(true)
    })

    it('does not show an error toast when directory selection is cancelled', async () => {
        const harness = createHarness()

        vi.spyOn(studioApi, 'pickDirectory').mockRejectedValue(
            new StudioApiError({ error: 'Selection cancelled or failed' }, 400),
        )

        await newWorkspace(harness.get, harness.set)

        expect(showToastMock).not.toHaveBeenCalled()
        expect(harness.read().workingDir).toBe('/tmp/old-workspace')
    })

    it('persists assistant action dedupe state when saving a workspace', async () => {
        const harness = createHarness({
            ...createWorkspaceState(),
            workingDir: '/tmp/save-workspace',
            assistantModel: { provider: 'openai', modelId: 'gpt-5.4' },
            appliedAssistantActionMessageIds: { 'msg-1': true },
            assistantActionResults: { 'msg-1': { applied: 1, failed: 0 } },
            listWorkspaces: vi.fn(),
        } as unknown as StudioState)

        const saveSpy = vi.spyOn(savedWorkspacesApi, 'save').mockResolvedValue({
            ok: true,
            id: 'workspace-saved',
            workingDir: '/tmp/save-workspace',
            updatedAt: Date.now(),
        })
        vi.spyOn(savedWorkspacesApi, 'list').mockResolvedValue([])
        vi.spyOn(studioApi, 'updateConfig').mockResolvedValue({ lastWorkspaceId: 'workspace-saved' })

        await saveWorkspace(harness.get, harness.set)

        expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
            schemaVersion: 1,
            assistantModel: { provider: 'openai', modelId: 'gpt-5.4' },
            appliedAssistantActionMessageIds: { 'msg-1': true },
            assistantActionResults: { 'msg-1': { applied: 1, failed: 0 } },
        }))
    })

    it('rehydrates assistant action dedupe state when loading a workspace', async () => {
        const harness = createHarness({
            ...createWorkspaceState(),
            rehydrateSessions: vi.fn(),
            listSessions: vi.fn(),
            listWorkspaces: vi.fn(),
        } as unknown as StudioState)

        vi.spyOn(savedWorkspacesApi, 'get').mockResolvedValue({
            schemaVersion: 1,
            workingDir: '/tmp/load-workspace',
            agents: [],
            chatBindings: {},
            assistantModel: { provider: 'openai', modelId: 'gpt-5.4' },
            appliedAssistantActionMessageIds: { 'msg-2': true },
            assistantActionResults: { 'msg-2': { applied: 2, failed: 0 } },
            markdownEditors: [],
            teams: [],
        })
        vi.spyOn(savedWorkspacesApi, 'setHidden').mockResolvedValue({ ok: true, id: 'workspace-1', hiddenFromList: false })
        vi.spyOn(studioApi, 'activate').mockResolvedValue({ ok: true, activeProjectDir: '/tmp/load-workspace' })

        await loadWorkspace('workspace-1', harness.get, harness.set)

        expect(harness.read().assistantModel).toEqual({ provider: 'openai', modelId: 'gpt-5.4' })
        expect(harness.read().appliedAssistantActionMessageIds).toEqual({ 'msg-2': true })
        expect(harness.read().assistantActionResults).toEqual({ 'msg-2': { applied: 2, failed: 0 } })
        expect(harness.read().workspaceMode).toBe('export')
    })
})
