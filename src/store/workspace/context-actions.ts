import { setApiWorkingDirContext } from '../../api-core'
import { studioApi } from '../../api-clients/studio'
import { normalizePath } from './helpers'
import { buildCanvasViewResetState } from './focus-mode-state'
import type { StudioState } from '../types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export function setWorkingDirImpl(get: GetState, set: SetState, dir: string) {
    const normalized = normalizePath(dir)
    if (!normalized) return
    setApiWorkingDirContext(normalized)
    set((state: StudioState) => ({
        workspaceId: state.workspaceList.find((entry) => entry.workingDir === normalized)?.id || null,
        workingDir: normalized,
        agents: state.agents,
        drafts: {},
        markdownEditors: [],
        editingTarget: null,
        selectedAgentId: null,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        ...buildCanvasViewResetState(),
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatDrafts: {},
        chatPrefixes: {},
        activeChatAgentId: null,
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionMutationPending: {},
        sessionReverts: {},
        sessions: [],
        inspectorFocus: null,
        isTrackingOpen: false,
        workspaceDirty: true,
        teams: [],
        selectedTeamId: null,
        teamEditorState: null,
        teamThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
    }))
    get().initRealtimeEvents()
    studioApi.activate(normalized).catch((error) => console.warn('[studio] activate failed', error))
}
