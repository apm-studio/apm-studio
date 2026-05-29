import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import { createIntegrationSlice } from './slice'

type FakeEventSource = {
    onmessage: ((event: { data: string }) => void) | null
    onerror: (() => void) | null
    close: ReturnType<typeof vi.fn>
}

const {
    chatEventsMock,
    listPendingPermissionsMock,
    listPendingQuestionsMock,
    resolveSessionMock,
    chatMessagesMock,
    statusMock,
    todosMock,
    compileMock,
    currentSources,
} = vi.hoisted(() => ({
    chatEventsMock: vi.fn(),
    listPendingPermissionsMock: vi.fn(),
    listPendingQuestionsMock: vi.fn(),
    resolveSessionMock: vi.fn(),
    chatMessagesMock: vi.fn(),
    statusMock: vi.fn(),
    todosMock: vi.fn(),
    compileMock: vi.fn(),
    currentSources: {
        chat: null as FakeEventSource | null,
    },
}))

vi.mock('../../api-clients/chat', () => ({
    chatApi: {
        events: chatEventsMock,
        listPendingPermissions: listPendingPermissionsMock,
        listPendingQuestions: listPendingQuestionsMock,
        resolveSession: resolveSessionMock,
        messages: chatMessagesMock,
        status: statusMock,
        todos: todosMock,
    },
}))

vi.mock('../../api-clients/compile', () => ({
    compileApi: {
        compile: compileMock,
    },
}))

function createFakeEventSource(): FakeEventSource {
    return {
        onmessage: null,
        onerror: null,
        close: vi.fn(),
    }
}

function emitEvent(source: FakeEventSource | null, payload: unknown) {
    source?.onmessage?.({ data: JSON.stringify(payload) })
}

function createBaseState(loadThreads: ReturnType<typeof vi.fn>): StudioState {
    return {
        workingDir: '/tmp/workspace',
        agents: [],
        teams: [],
        teamThreads: {
            'team-1': [{
                id: 'thread-1',
                teamId: 'team-1',
                status: 'idle',
                participantSessions: {},
                participantStatuses: {},
                createdAt: 1,
            }],
        },
        activeThreadId: 'thread-1',
        activeThreadParticipantKey: null,
        sessions: [],
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
        sessionReverts: {},
        runtimeReloadPending: false,
        workspaceId: 'workspace-1',
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
        projectionDirty: {
            agentIds: [],
            teamIds: [],
            draftIds: [],
            workspaceWide: false,
        },
        theme: 'light',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isPackageLibraryOpen: false,
        canvasTerminals: [],
        canvasCenter: null,
        layoutTeamId: null,
        selectedTeamId: null,
        teamEditorState: null,
        isAssistantOpen: false,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
        loadThreads,
        applyPendingRuntimeReload: vi.fn(async () => false),
        clearProjectionDirty: vi.fn(),
        registerBinding: vi.fn(),
        upsertSession: vi.fn(),
        clearChatDraftMessages: vi.fn(),
        setSessionMessages: vi.fn(),
        setSessionLoading: vi.fn(),
        setSessionStatus: vi.fn(),
    } as unknown as StudioState
}

function createHarness(loadThreads: ReturnType<typeof vi.fn>) {
    let state = createBaseState(loadThreads)
    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }
    const get = () => state

    state.registerBinding = vi.fn((chatKey: string, sessionId: string) => {
        state.chatKeyToSession[chatKey] = sessionId
        state.sessionToChatKey[sessionId] = chatKey
    })
    state.upsertSession = vi.fn((session) => {
        state.seEntities[session.id] = session
    })
    state.clearProjectionDirty = vi.fn((patch) => {
        const agentIds = new Set(patch?.agentIds || [])
        const teamIds = new Set(patch?.teamIds || [])
        const draftIds = new Set(patch?.draftIds || [])
        state.projectionDirty = {
            agentIds: state.projectionDirty.agentIds.filter((id) => !agentIds.has(id)),
            teamIds: state.projectionDirty.teamIds.filter((id) => !teamIds.has(id)),
            draftIds: state.projectionDirty.draftIds.filter((id) => !draftIds.has(id)),
            workspaceWide: patch?.workspaceWide ? false : state.projectionDirty.workspaceWide,
        }
    })
    state.clearChatDraftMessages = vi.fn((chatKey: string) => {
        delete state.chatDrafts[chatKey]
    })
    state.setSessionMessages = vi.fn((sessionId: string, messages) => {
        state.seMessages[sessionId] = messages
    })
    state.setSessionLoading = vi.fn((sessionId: string, loading: boolean) => {
        if (loading) {
            state.sessionLoading[sessionId] = true
            return
        }
        delete state.sessionLoading[sessionId]
    })
    state.setSessionStatus = vi.fn((sessionId: string, status) => {
        state.seStatuses[sessionId] = status
    })

    state = {
        ...state,
        ...createIntegrationSlice(set, get, {} as never),
    }

    return {
        get: () => state,
    }
}

let rafCallbacks: Array<() => void> = []

function flushRAF() {
    const callbacks = [...rafCallbacks]
    rafCallbacks = []
    for (const callback of callbacks) {
        callback()
    }
}

async function flushPromises(count = 8) {
    for (let index = 0; index < count; index += 1) {
        await Promise.resolve()
    }
}

describe('integration slice team participant sync', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        rafCallbacks = []
        currentSources.chat = null

        vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
            rafCallbacks.push(callback)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())

        chatEventsMock.mockReset().mockImplementation(() => {
            const source = createFakeEventSource()
            currentSources.chat = source
            return source as unknown as EventSource
        })
        listPendingPermissionsMock.mockReset().mockResolvedValue([])
        listPendingQuestionsMock.mockReset().mockResolvedValue([])
        resolveSessionMock.mockReset().mockResolvedValue({ found: false })
        chatMessagesMock.mockReset().mockResolvedValue({
            messages: [
                {
                    id: 'msg-1',
                    role: 'assistant',
                    createdAt: 1000,
                    parts: [
                        {
                            id: 'part-1',
                            type: 'text',
                            text: 'Auto-wake reply',
                        },
                    ],
                },
            ],
            nextCursor: null,
        })
        statusMock.mockReset().mockResolvedValue({ status: { type: 'idle' } })
        todosMock.mockReset().mockResolvedValue([])
        compileMock.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('hydrates team participant bindings and history from server thread updates', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'team:team-1:thread:thread-1:participant:participant-2'

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'team.thread.updated',
            properties: {
                thread: {
                    id: 'thread-1',
                    teamId: 'team-1',
                    status: 'idle',
                    participantSessions: {
                        'participant-2': 'session-2',
                    },
                    participantStatuses: {
                        'participant-2': { type: 'idle', updatedAt: 1000 },
                    },
                    createdAt: 1,
                },
            },
        })

        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().teamThreads['team-1']?.[0]?.participantSessions?.['participant-2']).toBe('session-2')
        expect(chatMessagesMock).toHaveBeenCalledWith('session-2')
        expect(loadThreads).not.toHaveBeenCalled()

        harness.get().cleanupRealtimeEvents()
    })

    it('clears matching projection dirtiness from runtime projection consumption events', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        harness.get().projectionDirty = {
            agentIds: ['agent-1', 'agent-2'],
            teamIds: ['team-1'],
            draftIds: ['draft-1', 'draft-2'],
            workspaceWide: true,
        }

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'runtime.projection.consumed',
            properties: {
                patch: {
                    agentIds: ['agent-2'],
                    teamIds: ['team-1'],
                    draftIds: ['draft-2'],
                    workspaceWide: true,
                },
            },
        })

        expect(harness.get().projectionDirty).toEqual({
            agentIds: ['agent-1'],
            teamIds: [],
            draftIds: ['draft-1'],
            workspaceWide: false,
        })

        harness.get().cleanupRealtimeEvents()
    })

    it('rehydrates pending interactions, status, and todos when the realtime stream reconnects', async () => {
        listPendingPermissionsMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{
                id: 'permission-1',
                sessionId: 'session-1',
                permission: 'bash',
                patterns: [],
                always: [],
                metadata: {},
            }])
        listPendingQuestionsMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{
                id: 'question-1',
                sessionId: 'session-1',
                questions: [{ header: 'Scope', question: 'Which scope?', options: [] }],
            }])
        statusMock
            .mockResolvedValueOnce({ status: { type: 'idle' } })
            .mockResolvedValueOnce({ status: { type: 'busy' } })
        todosMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ content: 'Fix bug', status: 'pending', priority: 'medium' }])
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        harness.get().registerBinding('agent-1', 'session-1')

        harness.get().initRealtimeEvents()

        await vi.waitFor(() => {
            expect(harness.get().seStatuses['session-1']?.type).toBe('idle')
        })

        expect(harness.get().sePermissions).toEqual({})
        expect(harness.get().seQuestions).toEqual({})

        emitEvent(currentSources.chat, {
            type: 'server.connected',
        })

        await vi.waitFor(() => {
            expect(harness.get().seStatuses['session-1']?.type).toBe('busy')
        })

        expect(listPendingPermissionsMock).toHaveBeenCalledTimes(2)
        expect(listPendingQuestionsMock).toHaveBeenCalledTimes(2)
        expect(harness.get().sePermissions['session-1']?.id).toBe('permission-1')
        expect(harness.get().seQuestions['session-1']?.id).toBe('question-1')
        expect(harness.get().seTodos['session-1']?.[0]?.content).toBe('Fix bug')

        harness.get().cleanupRealtimeEvents()
    })

    it('clears stale pending interactions when OpenCode reports none', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        harness.get().sePermissions['session-1'] = {
            id: 'stale-permission',
            sessionId: 'session-1',
            permission: 'bash',
            patterns: [],
            always: [],
            metadata: {},
        }
        harness.get().seQuestions['session-1'] = {
            id: 'stale-question',
            sessionId: 'session-1',
            questions: [{ header: 'Scope', question: 'Which scope?', options: [] }],
        }

        harness.get().initRealtimeEvents()

        await flushPromises()

        expect(harness.get().sePermissions).toEqual({})
        expect(harness.get().seQuestions).toEqual({})

        harness.get().cleanupRealtimeEvents()
    })

    it('does not surface pending interactions for unresolved sessions', async () => {
        listPendingPermissionsMock.mockResolvedValue([{
            id: 'permission-1',
            sessionId: 'unknown-session',
            permission: 'bash',
            patterns: [],
            always: [],
            metadata: {},
        }])
        listPendingQuestionsMock.mockResolvedValue([{
            id: 'question-1',
            sessionId: 'unknown-session',
            questions: [{ header: 'Scope', question: 'Which scope?', options: [] }],
        }])
        resolveSessionMock.mockResolvedValue({ found: false })
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)

        harness.get().initRealtimeEvents()

        await flushPromises()

        expect(resolveSessionMock).toHaveBeenCalledWith('unknown-session')
        expect(harness.get().sePermissions).toEqual({})
        expect(harness.get().seQuestions).toEqual({})

        harness.get().cleanupRealtimeEvents()
    })

    it('binds unknown team participant sessions from live message events without re-marking them as loading', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'team:team-1:thread:thread-1:participant:participant-2'

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'message.updated',
            properties: {
                ownerId: chatKey,
                ownerKind: 'team',
                info: {
                    sessionID: 'session-2',
                    id: 'msg-1',
                    role: 'assistant',
                    time: { created: 1000 },
                },
            },
        })

        flushRAF()
        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().sessionLoading['session-2']).toBeUndefined()
        expect(harness.get().seMessages['session-2']?.[0]?.id).toBe('msg-1')
        expect(loadThreads).not.toHaveBeenCalled()

        harness.get().cleanupRealtimeEvents()
    })

    it('does not accept camelCase session aliases at the realtime transport boundary', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'team:team-1:thread:thread-1:participant:participant-2'

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'session.status',
            properties: {
                ownerId: chatKey,
                sessionId: 'session-2',
                status: { type: 'busy' },
            },
        })

        flushRAF()
        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBeUndefined()
        expect(harness.get().seStatuses['session-2']).toBeUndefined()
        expect(resolveSessionMock).not.toHaveBeenCalledWith('session-2')

        harness.get().cleanupRealtimeEvents()
    })

    it('does not let a background agent event steal the selected thread binding', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        harness.get().chatKeyToSession['agent-1'] = 'selected-session'
        harness.get().sessionToChatKey['selected-session'] = 'agent-1'

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'session.status',
            properties: {
                ownerId: 'agent-1',
                sessionID: 'running-session',
                status: { type: 'busy' },
            },
        })

        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession['agent-1']).toBe('selected-session')
        expect(harness.get().sessionToChatKey['selected-session']).toBe('agent-1')
        expect(harness.get().sessionToChatKey['running-session']).toBeUndefined()
        expect(harness.get().seStatuses['running-session']).toBeUndefined()

        harness.get().cleanupRealtimeEvents()
    })

    it('does not let lazy ownership resolution steal the selected agent thread', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        harness.get().chatKeyToSession['agent-1'] = 'selected-session'
        harness.get().sessionToChatKey['selected-session'] = 'agent-1'
        resolveSessionMock.mockReset().mockResolvedValue({
            found: true,
            ownerId: 'agent-1',
            ownerKind: 'agent',
        })

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'session.status',
            properties: {
                sessionID: 'running-session',
                status: { type: 'busy' },
            },
        })

        await Promise.resolve()
        await Promise.resolve()

        expect(resolveSessionMock).toHaveBeenCalledWith('running-session')
        expect(harness.get().chatKeyToSession['agent-1']).toBe('selected-session')
        expect(harness.get().sessionToChatKey['running-session']).toBeUndefined()
        expect(harness.get().seStatuses['running-session']).toBeUndefined()

        harness.get().cleanupRealtimeEvents()
    })

    it('binds and streams OpenCode team participant events with transport status for abort UI', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'team:team-1:thread:thread-1:participant:participant-2'

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'message.updated',
            properties: {
                ownerId: chatKey,
                ownerKind: 'team',
                info: {
                    sessionID: 'session-2',
                    id: 'msg-1',
                    role: 'assistant',
                    time: { created: 1000 },
                },
            },
        })
        emitEvent(currentSources.chat, {
            type: 'session.status',
            properties: {
                sessionID: 'session-2',
                status: { type: 'busy' },
            },
        })
        emitEvent(currentSources.chat, {
            type: 'message.part.delta',
            properties: {
                sessionID: 'session-2',
                messageID: 'msg-1',
                partID: 'part-1',
                field: 'text',
                delta: 'live output',
            },
        })

        flushRAF()
        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().seStatuses['session-2']).toEqual({ type: 'busy' })
        expect(harness.get().seMessages['session-2']?.[0]?.content).toBe('live output')
        expect(chatMessagesMock).not.toHaveBeenCalledWith('session-2')
        expect(loadThreads).not.toHaveBeenCalled()

        harness.get().cleanupRealtimeEvents()
    })

    it('buffers unknown team participant events until session ownership is resolved', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'team:team-1:thread:thread-1:participant:participant-2'

        let resolveOwnership: (value: { found: boolean; ownerId?: string; ownerKind?: string }) => void = () => {}
        resolveSessionMock.mockReset().mockImplementation(() => new Promise((resolve) => {
            resolveOwnership = resolve as typeof resolveOwnership
        }))

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'session.status',
            properties: {
                sessionID: 'session-2',
                status: { type: 'busy' },
            },
        })
        emitEvent(currentSources.chat, {
            type: 'message.updated',
            properties: {
                info: {
                    sessionID: 'session-2',
                    id: 'msg-1',
                    role: 'assistant',
                    time: { created: 1000 },
                },
            },
        })

        flushRAF()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBeUndefined()
        expect(harness.get().sessionLoading['session-2']).toBeUndefined()
        expect(harness.get().seMessages['session-2']).toBeUndefined()

        resolveOwnership({
            found: true,
            ownerId: chatKey,
            ownerKind: 'team',
        })
        await Promise.resolve()
        await Promise.resolve()
        flushRAF()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().teamThreads['team-1']?.[0]?.participantSessions?.['participant-2']).toBe('session-2')
        expect(harness.get().sessionLoading['session-2']).toBeUndefined()
        expect(harness.get().seStatuses['session-2']).toEqual({ type: 'busy' })
        expect(harness.get().seMessages['session-2']?.[0]?.id).toBe('msg-1')
        expect(loadThreads).not.toHaveBeenCalled()

        harness.get().cleanupRealtimeEvents()
    })

    it('treats server team thread updates as authoritative for participant status and final snapshot sync', async () => {
        const loadThreads = vi.fn(async () => {})
        const harness = createHarness(loadThreads)
        const chatKey = 'team:team-1:thread:thread-1:participant:participant-2'

        chatMessagesMock.mockResolvedValue({
            messages: [
                {
                    id: 'msg-1',
                    role: 'assistant',
                    createdAt: 1000,
                    parts: [
                        { id: 'text-1', type: 'text', text: 'Recovered reply' },
                    ],
                },
            ],
            nextCursor: null,
        })

        harness.get().initRealtimeEvents()

        emitEvent(currentSources.chat, {
            type: 'team.thread.updated',
            properties: {
                thread: {
                    id: 'thread-1',
                    teamId: 'team-1',
                    status: 'idle',
                    participantSessions: {
                        'participant-2': 'session-2',
                    },
                    participantStatuses: {
                        'participant-2': { type: 'busy', updatedAt: 1000 },
                    },
                    createdAt: 1,
                },
            },
        })

        await Promise.resolve()

        emitEvent(currentSources.chat, {
            type: 'team.thread.updated',
            properties: {
                thread: {
                    id: 'thread-1',
                    teamId: 'team-1',
                    status: 'idle',
                    participantSessions: {
                        'participant-2': 'session-2',
                    },
                    participantStatuses: {
                        'participant-2': { type: 'idle', updatedAt: 2000 },
                    },
                    createdAt: 1,
                },
            },
        })

        await Promise.resolve()
        await Promise.resolve()

        expect(harness.get().chatKeyToSession[chatKey]).toBe('session-2')
        expect(harness.get().sessionLoading['session-2']).toBeUndefined()
        expect(harness.get().seStatuses['session-2']).toEqual({ type: 'idle', updatedAt: 2000 })
        expect(harness.get().seMessages['session-2']?.[0]?.content).toBe('Recovered reply')

        harness.get().cleanupRealtimeEvents()
    })
})
