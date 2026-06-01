import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioState } from '../types'
import type { ChatRuntimeConfig } from './chat-runtime-target'
import { createChatSendActions } from './chat-send-actions'
import { createEmptyProjectionDirtyState } from '../runtime/change-policy'

const {
    sendMock,
    listModelsMock,
    resolveChatRuntimeTargetMock,
} = vi.hoisted(() => ({
    sendMock: vi.fn(),
    listModelsMock: vi.fn(),
    resolveChatRuntimeTargetMock: vi.fn(),
}))

vi.mock('../../api-clients/chat', () => ({
    chatApi: {
        send: sendMock,
    },
}))

vi.mock('../../api-clients/opencode', () => ({
    opencodeApi: {
        models: {
            list: listModelsMock,
        },
    },
}))

vi.mock('../../lib/api-errors', () => ({
    formatStudioApiErrorMessage: () => 'request failed',
}))

vi.mock('../../lib/agents', () => ({
    hasModelConfig: () => true,
}))

vi.mock('./chat-internals', () => ({
    appendChatMessage: vi.fn(),
    appendChatSystemMessage: vi.fn(),
    syncChatMessages: vi.fn(),
}))

vi.mock('./chat-runtime-target', async () => {
    const actual = await vi.importActual<typeof import('./chat-runtime-target')>('./chat-runtime-target')
    return {
        ...actual,
        resolveChatRuntimeTarget: resolveChatRuntimeTargetMock,
    }
})

function createRuntimeConfig(): ChatRuntimeConfig {
    return {
        skillRefs: [],
        model: { provider: 'openai', modelId: 'gpt-5.4' },
        modelVariant: null,
        runtimeAgentId: 'build',
        mcpServerNames: [],
        planMode: false,
    }
}

function createAgentTarget(chatKey = 'agent-1') {
    return {
        chatKey,
        kind: 'agent' as const,
        name: 'Agent 1',
        runtimeConfig: createRuntimeConfig(),
        assistantContext: null,
        executionScope: {
            agentId: chatKey,
            teamId: null,
        },
        requestTarget: {
            agentId: chatKey,
            agentName: 'Agent 1',
        },
    }
}

function createTeamTarget(chatKey: string, teamId: string, threadId: string) {
    return {
        chatKey,
        kind: 'team-participant' as const,
        name: 'Lead',
        runtimeConfig: createRuntimeConfig(),
        assistantContext: null,
        executionScope: {
            agentId: 'local-agent',
            teamId,
        },
        requestTarget: {
            agentId: chatKey,
            agentName: 'Lead',
            teamId,
            teamThreadId: threadId,
        },
    }
}

function createAssistantTarget(
    chatKey: string,
    availableModels: Array<{ provider: string; providerName: string; modelId: string; name: string }> = [],
    model: { provider: string; modelId: string } | null = { provider: 'openai', modelId: 'gpt-5.4' },
) {
    return {
        chatKey,
        kind: 'assistant' as const,
        name: 'APM Assistant',
        runtimeConfig: {
            ...createRuntimeConfig(),
            model,
        },
        assistantContext: {
            workingDir: '/tmp/workspace',
            agents: [],
            teams: [],
            drafts: [],
            availableModels,
        },
        executionScope: {
            runtimeAgentId: null,
            teamId: null,
        },
        requestTarget: {
            agentId: chatKey,
            agentName: 'APM Assistant',
        },
    }
}

function createMinimalState(overrides: Partial<StudioState> = {}): StudioState {
    const state = {
        runtimeReloadPending: false,
        projectionDirty: createEmptyProjectionDirtyState(),
        workspaceDirty: false,
        workingDir: '/tmp/workspace',
        agents: [],
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
        activeChatAgentId: null,
        sessions: [],
        teamThreads: {},
        assistantAvailableModels: [],
        watchSessionLifecycle: vi.fn(),
        stopWatchingSessionLifecycle: vi.fn(),
        ...overrides,
    } as unknown as StudioState

    state.applyPendingRuntimeReload = vi.fn(async () => true)
    state.clearSessionRevert = vi.fn()
    state.clearProjectionDirty = vi.fn()
    state.appendSessionMessage = vi.fn()
    state.removeSessionMessage = vi.fn()
    state.registerBinding = vi.fn((chatKey: string, sessionId: string) => {
        state.chatKeyToSession[chatKey] = sessionId
        state.sessionToChatKey[sessionId] = chatKey
    })
    state.clearChatDraftMessages = vi.fn((chatKey: string) => {
        delete state.chatDrafts[chatKey]
    })
    state.upsertSession = vi.fn()
    state.setSessionMessages = vi.fn((sessionId: string, messages: StudioState['seMessages'][string]) => {
        state.seMessages[sessionId] = messages
    })
    state.setSessionLoading = vi.fn((sessionId: string, loading: boolean) => {
        if (loading) {
            state.sessionLoading[sessionId] = true
            return
        }
        delete state.sessionLoading[sessionId]
    })
    state.setSessionStatus = vi.fn((sessionId: string, status: unknown) => {
        state.seStatuses[sessionId] = status as StudioState['seStatuses'][string]
    })
    state.saveWorkspace = vi.fn(async () => {})
    state.setAssistantModel = vi.fn((model) => {
        state.assistantModel = model
    })
    state.setAssistantAvailableModels = vi.fn((models) => {
        state.assistantAvailableModels = models
    })

    return state
}

describe('chat send actions', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        sendMock.mockReset()
        listModelsMock.mockReset()
        resolveChatRuntimeTargetMock.mockReset()
    })

    it('starts authoritative lifecycle supervision after a successful send', async () => {
        const sessionId = 'session-1'
        const state = createMinimalState({
            chatKeyToSession: { 'agent-1': sessionId },
            sessionToChatKey: { [sessionId]: 'agent-1' },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createAgentTarget())
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createAgentTarget().runtimeConfig,
        }))

        await actions.sendMessage('agent-1', 'hello')

        expect(state.watchSessionLifecycle).toHaveBeenCalledWith('agent-1', sessionId)
    })

    it('sends the current projection dirty scope as an execution hint', async () => {
        const sessionId = 'session-1'
        const state = createMinimalState({
            projectionDirty: {
                agentIds: ['agent-2'],
                teamIds: [],
                draftIds: ['draft-1'],
                workspaceWide: false,
            },
            chatKeyToSession: { 'agent-1': sessionId },
            sessionToChatKey: { [sessionId]: 'agent-1' },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createAgentTarget())
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createAgentTarget().runtimeConfig,
        }))

        await actions.sendMessage('agent-1', 'hello')

        expect(sendMock).toHaveBeenCalledWith(sessionId, expect.objectContaining({
            projectionScope: {
                agentIds: ['agent-2'],
                teamIds: [],
                draftIds: ['draft-1'],
                workspaceWide: false,
            },
        }))
    })

    it('does not start client lifecycle supervision for team sends', async () => {
        const teamId = 'team-1'
        const threadId = 'thread-1'
        const participantKey = 'participant-1'
        const chatKey = `team:${teamId}:thread:${threadId}:participant:${participantKey}`
        const sessionId = 'session-1'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createTeamTarget(chatKey, teamId, threadId))
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createTeamTarget(chatKey, teamId, threadId).runtimeConfig,
        }))

        await actions.sendTeamMessage(teamId, threadId, participantKey, 'hello')

        expect(state.watchSessionLifecycle).not.toHaveBeenCalled()
    })

    it('shows the first standalone user input as the sidebar title immediately and refreshes later', async () => {
        const sessionId = 'session-standalone-1'
        const state = createMinimalState({
            chatKeyToSession: { 'agent-1': sessionId },
            sessionToChatKey: { [sessionId]: 'agent-1' },
            sessionLoading: { [sessionId]: true },
            sessions: [{ id: sessionId, title: 'APM Studio: Agent 1 [studio:agent-1:hash]' }],
            initRealtimeEvents: vi.fn(),
            listSessions: vi.fn(async () => {}),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createAgentTarget())
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createAgentTarget().runtimeConfig,
        }))

        await actions.sendMessage('agent-1', 'Draft launch notes for the beta release')

        expect(state.sessions[0]?.sidebarTitle).toBe('Draft launch notes for the beta release')

        await vi.advanceTimersByTimeAsync(12_100)
        expect(state.listSessions).toHaveBeenCalledTimes(3)
    })

    it('shows the first Team user input as the thread name immediately and refreshes thread snapshots later', async () => {
        const teamId = 'team-1'
        const threadId = 'thread-1'
        const participantKey = 'participant-1'
        const chatKey = `team:${teamId}:thread:${threadId}:participant:${participantKey}`
        const sessionId = 'session-team-1'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            teamThreads: {
                [teamId]: [{
                    id: threadId,
                    teamId,
                    status: 'idle',
                    participantSessions: {},
                    participantStatuses: {},
                    createdAt: Date.now(),
                }],
            },
            initRealtimeEvents: vi.fn(),
            loadThreads: vi.fn(async () => {}),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockReturnValue(createTeamTarget(chatKey, teamId, threadId))
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createTeamTarget(chatKey, teamId, threadId).runtimeConfig,
        }))

        await actions.sendTeamMessage(teamId, threadId, participantKey, 'Investigate why the mobile build failed')

        expect(state.teamThreads[teamId]?.[0]?.name).toBe('Investigate why the mobile build failed')

        await vi.advanceTimersByTimeAsync(12_100)
        expect(state.loadThreads).toHaveBeenCalledTimes(3)
        expect(state.loadThreads).toHaveBeenCalledWith(teamId)
    })

    it('hydrates assistant available models before sending when the workspace cache is empty', async () => {
        const chatKey = 'studio-assistant'
        const sessionId = 'session-assistant-1'
        const state = createMinimalState({
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockImplementation((getState: typeof get, nextChatKey: string) => (
            createAssistantTarget(nextChatKey, getState().assistantAvailableModels, getState().assistantModel)
        ))
        listModelsMock.mockResolvedValue([
            {
                provider: 'openai',
                providerName: 'OpenAI',
                id: 'gpt-5.4',
                name: 'GPT-5.4',
                connected: true,
                toolCall: true,
            },
            {
                provider: 'anthropic',
                providerName: 'Anthropic',
                id: 'claude-disconnected',
                name: 'Claude Disconnected',
                connected: false,
                toolCall: true,
            },
        ])
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createAssistantTarget(chatKey).runtimeConfig,
        }))

        await actions.sendMessage(chatKey, 'hello')

        expect(listModelsMock).toHaveBeenCalledTimes(1)
        expect(state.setAssistantAvailableModels).toHaveBeenCalledWith([
            {
                provider: 'openai',
                providerName: 'OpenAI',
                modelId: 'gpt-5.4',
                name: 'GPT-5.4',
            },
        ])
        expect(sendMock).toHaveBeenCalledWith(sessionId, expect.objectContaining({
            assistantContext: expect.objectContaining({
                availableModels: [
                    {
                        provider: 'openai',
                        providerName: 'OpenAI',
                        modelId: 'gpt-5.4',
                        name: 'GPT-5.4',
                    },
                ],
            }),
        }))
    })

    it('replaces a stale assistant model with the preferred connected tool-capable model before sending', async () => {
        const chatKey = 'studio-assistant'
        const sessionId = 'session-assistant-2'
        const state = createMinimalState({
            assistantModel: { provider: 'openai', modelId: 'gpt-stale' },
            assistantAvailableModels: [
                {
                    provider: 'openai',
                    providerName: 'OpenAI',
                    modelId: 'gpt-stale',
                    name: 'GPT Stale',
                },
            ],
            chatKeyToSession: { [chatKey]: sessionId },
            sessionToChatKey: { [sessionId]: chatKey },
            sessionLoading: { [sessionId]: true },
            initRealtimeEvents: vi.fn(),
        })
        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
        }

        resolveChatRuntimeTargetMock.mockImplementation((getState: typeof get, nextChatKey: string) => (
            createAssistantTarget(nextChatKey, getState().assistantAvailableModels, getState().assistantModel)
        ))
        listModelsMock.mockResolvedValue([
            {
                provider: 'anthropic',
                providerName: 'Anthropic',
                id: 'claude-sonnet-4',
                name: 'Claude Sonnet 4',
                connected: true,
                toolCall: false,
            },
            {
                provider: 'opencode',
                providerName: 'OpenCode Zen',
                id: 'gpt-5-nano',
                name: 'GPT-5 Nano',
                connected: true,
                toolCall: true,
            },
            {
                provider: 'openai',
                providerName: 'OpenAI',
                id: 'gpt-5.4',
                name: 'GPT-5.4',
                connected: true,
                toolCall: true,
            },
        ])
        sendMock.mockResolvedValue(undefined)

        const actions = createChatSendActions(set, get, async () => ({
            sessionId,
            runtimeConfig: createAssistantTarget(chatKey).runtimeConfig,
        }))

        await actions.sendMessage(chatKey, 'hello')

        expect(state.setAssistantModel).toHaveBeenCalledWith({
            provider: 'openai',
            modelId: 'gpt-5.4',
        })
        expect(sendMock).toHaveBeenCalledWith(sessionId, expect.objectContaining({
            agent: expect.objectContaining({
                model: {
                    provider: 'openai',
                    modelId: 'gpt-5.4',
                },
            }),
            assistantContext: expect.objectContaining({
                availableModels: [
                    {
                        provider: 'openai',
                        providerName: 'OpenAI',
                        modelId: 'gpt-5.4',
                        name: 'GPT-5.4',
                    },
                    {
                        provider: 'opencode',
                        providerName: 'OpenCode Zen',
                        modelId: 'gpt-5-nano',
                        name: 'GPT-5 Nano',
                    },
                ],
            }),
        }))
    })
})
