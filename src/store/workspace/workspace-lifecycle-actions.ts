import { setApiWorkingDirContext } from '../../api-core'
import { savedWorkspacesApi } from '../../api-clients/saved-workspaces'
import { studioApi } from '../../api-clients/studio'
import { createEmptyProjectionDirtyState } from '../runtime/change-policy'
import type { StudioState } from '../types'
import { buildCanvasViewResetState } from './focus-mode-state'
import { saveWorkspace as saveWorkspaceImpl } from './operations'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

function buildClosedWorkspaceState(workspaceMode: StudioState['workspaceMode']): Partial<StudioState> {
    return {
        workspaceId: null,
        workingDir: '',
        agents: [],
        teams: [],
        drafts: {},
        markdownEditors: [],
        canvasTerminals: [],
        canvasCenter: null,
        layoutTeamId: null,
        editingTarget: null,
        selectedAgentId: null,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        workspaceMode,
        selectedTeamId: null,
        teamEditorState: null,
        activeThreadId: null,
        activeThreadParticipantKey: null,
        teamThreads: {},
        ...buildCanvasViewResetState(),
        canvasRevealTarget: null,
        inspectorFocus: null,
        workspaceList: [],
        workspaceDirty: false,
        projectionDirty: createEmptyProjectionDirtyState(),
        runtimeReloadPending: false,
        sessions: [],
        activeChatAgentId: null,
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
        chatDrafts: {},
        chatPrefixes: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionMutationPending: {},
        sessionReverts: {},
    }
}

export async function closeWorkspaceImpl(get: GetState, set: SetState, workspaceId: string) {
    if (!workspaceId) {
        return
    }

    const currentWorkspaceId = get().workspaceId
    if (currentWorkspaceId === workspaceId && get().workspaceDirty) {
        await saveWorkspaceImpl(get, set)
    }

    await savedWorkspacesApi.setHidden(workspaceId, true)
    await get().listWorkspaces()

    if (currentWorkspaceId === workspaceId) {
        studioApi.updateConfig({ lastWorkspaceId: undefined }).catch((error) => console.warn('[studio] clear lastWorkspaceId failed', error))
    }
}

export async function listWorkspacesImpl(set: SetState) {
    try {
        const list = await savedWorkspacesApi.list()
        set({ workspaceList: list })
    } catch {
        set({ workspaceList: [] })
    }
}

export async function deleteWorkspaceImpl(get: GetState, set: SetState, workspaceId: string) {
    if (!workspaceId) return
    await savedWorkspacesApi.delete(workspaceId)
    if (get().workspaceId === workspaceId) {
        get().cleanupRealtimeEvents()
        setApiWorkingDirContext(null)
        set(buildClosedWorkspaceState(get().workspaceMode))
        studioApi.updateConfig({ lastWorkspaceId: undefined }).catch((error) => console.warn('[studio] clear lastWorkspaceId failed', error))
    }
    get().listWorkspaces()
}
