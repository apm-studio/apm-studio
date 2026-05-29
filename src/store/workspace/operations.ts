/**
 * Workspace CRUD operations for the workspace slice.
 *
 * Each function receives Zustand's `get` and `set` so it integrates
 * seamlessly back into the store slice.
 */

import type { StudioState } from '../types'
import { setApiWorkingDirContext } from '../../api-core'
import { studioApi } from '../../api-clients/studio'
import { savedWorkspacesApi } from '../../api-clients/saved-workspaces'
import { showToast } from '../../lib/toast'
import { coerceStudioApiError, isStudioApiNotFoundError } from '../../lib/api-errors'
import {
    getMaxMarkdownEditorCounter,
    getMaxAgentCounter,
    normalizePath,
} from './helpers'
import { agentIdCounter, markdownEditorIdCounter } from './id-state'
import { createEmptyProjectionDirtyState } from '../runtime/change-policy'
import { buildCanvasViewResetState } from './focus-mode-state'
import type { PersistedWorkspaceSnapshot } from './persisted-workspace-types'
import { buildSavedWorkspaceSnapshot } from './workspace-save-snapshot'
import {
    hydrateWorkspaceAgents,
    hydrateWorkspaceCanvasTerminals,
    hydrateWorkspaceChatBindings,
    hydrateWorkspaceMarkdownEditors,
    hydrateWorkspaceTeams,
} from './workspace-hydration'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState

// ────────────────────────────────────────
// newWorkspace
// ────────────────────────────────────────

export async function newWorkspace(get: GetFn, set: SetFn) {
    try {
        const res = await studioApi.pickDirectory()
        if (res.path) {
            const dir = normalizePath(res.path)
            if (!dir) return
            const workspaceList = await savedWorkspacesApi.list(true).catch(err => { console.warn('[studio] workspace list failed', err); return [] })
            const existing = workspaceList.find((entry) => entry.workingDir === dir)
            if (existing) {
                await get().loadWorkspace(existing.id)
                return
            }

            agentIdCounter.value = 0
            markdownEditorIdCounter.value = 0
            get().cleanupRealtimeEvents()
            setApiWorkingDirContext(dir)
            set({
                workspaceId: null,
                workspaceList,
                workingDir: dir,
                agents: [],
                teams: [],
                drafts: {},
                markdownEditors: [],
                canvasTerminals: [],
                editingTarget: null,
                selectedAgentId: null,
                selectedAgentSessionId: null,
                selectedMarkdownEditorId: null,
                ...buildCanvasViewResetState(),
                inspectorFocus: null,
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
                sessions: [],
                isTrackingOpen: false,
                workspaceDirty: true,
                projectionDirty: createEmptyProjectionDirtyState(),
                runtimeReloadPending: false,
                teamEditorState: null,
                teamThreads: {},
                activeThreadId: null,
                activeThreadParticipantKey: null,
            })
            get().initRealtimeEvents()
            get().loadDraftsFromDisk()
            studioApi.activate(dir).catch(err => console.warn('[studio] activate failed', err))
        }
    } catch (err) {
        const normalized = coerceStudioApiError(err)
        if (normalized.message === 'Selection cancelled or failed') {
            return
        }
        console.error('Failed to pick directory', err)
        showToast('Studio could not open the working directory picker.', 'error', {
            title: 'Directory picker failed',
            dedupeKey: 'workspace:directory-picker-failed',
            actionLabel: 'Retry',
            onAction: () => {
                void get().newWorkspace()
            },
        })
    }
}

// ────────────────────────────────────────
// saveWorkspace
// ────────────────────────────────────────

export async function saveWorkspace(get: GetFn, set: SetFn) {
    const state = get()
    if (!state.workingDir) return
    const snapshot = buildSavedWorkspaceSnapshot(state)
    const saved = await savedWorkspacesApi.save(snapshot)
    set({ workspaceDirty: false, workspaceId: saved.id })
    get().listWorkspaces()
    studioApi.updateConfig({ lastWorkspaceId: saved.hiddenFromList ? undefined : saved.id }).catch(err => console.warn('[studio] lastWorkspaceId persist failed', err))
}

// ────────────────────────────────────────
// loadWorkspace
// ────────────────────────────────────────

export async function loadWorkspace(workspaceId: string, get: GetFn, set: SetFn) {
    try {
        const data = await savedWorkspacesApi.get(workspaceId) as PersistedWorkspaceSnapshot
        const loadedAgents = hydrateWorkspaceAgents(data)
        agentIdCounter.value = getMaxAgentCounter(loadedAgents)
        const loadedMarkdownEditors = hydrateWorkspaceMarkdownEditors(data)
        markdownEditorIdCounter.value = getMaxMarkdownEditorCounter(loadedMarkdownEditors)

        const chatBindings = hydrateWorkspaceChatBindings(data)

        const workingDir = normalizePath(data.workingDir || '')
        setApiWorkingDirContext(workingDir || null)
        get().cleanupRealtimeEvents()

        set({
            workspaceId,
            agents: loadedAgents,
            drafts: {},
            teams: hydrateWorkspaceTeams(data),
            selectedTeamId: null,
            teamEditorState: null,
            markdownEditors: loadedMarkdownEditors,
            editingTarget: null,
            selectedAgentId: null,
            selectedAgentSessionId: null,
            selectedMarkdownEditorId: null,
            ...buildCanvasViewResetState(),
            inspectorFocus: null,
            activeChatAgentId: null,
            chatPrefixes: {},
            chatDrafts: {},
            assistantModel: data.assistantModel || null,
            assistantAvailableModels: [],
            appliedAssistantActionMessageIds: { ...(data.appliedAssistantActionMessageIds || {}) },
            assistantActionResults: { ...(data.assistantActionResults || {}) },
            seEntities: {},
            seMessages: {},
            seStatuses: {},
            sePermissions: {},
            seQuestions: {},
            seTodos: {},
            chatKeyToSession: chatBindings.chatKeyToSession,
            sessionToChatKey: chatBindings.sessionToChatKey,
            sessionLoading: {},
            sessionMutationPending: {},
            sessionReverts: {},
            sessions: [],
            canvasTerminals: hydrateWorkspaceCanvasTerminals(data),
            isTrackingOpen: false,
            workspaceDirty: false,
            projectionDirty: createEmptyProjectionDirtyState(),
            runtimeReloadPending: false,
            workingDir,
            teamThreads: {},
            activeThreadId: null,
            activeThreadParticipantKey: null,
        })
        savedWorkspacesApi.setHidden(workspaceId, false)
            .then(() => get().listWorkspaces())
            .catch((err) => console.warn('[studio] workspace unhide failed', err))
        get().initRealtimeEvents()

        // Activate working directory on server
        if (workingDir) {
            studioApi.activate(workingDir).catch(err => console.warn('[studio] activate failed', err))
        }

        get().rehydrateSessions()
        get().listSessions()

        // Load all drafts from disk into memory
        get().loadDraftsFromDisk()
    } catch (err) {
        if (!isStudioApiNotFoundError(err)) {
            console.error(`Failed to load workspace ${workspaceId}:`, err)
            showToast('Studio could not load the saved workspace state.', 'error', {
                title: 'Workspace load failed',
                dedupeKey: `workspace:load-workspace:${workspaceId}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void get().loadWorkspace(workspaceId)
                },
            })
        }
    }
}
