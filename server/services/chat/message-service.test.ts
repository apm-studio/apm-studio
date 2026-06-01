import { beforeEach, describe, expect, it, vi } from 'vitest'

const promptAsyncMock = vi.fn()
const disposeInstanceMock = vi.fn()
const ensureAgentProjectionMock = vi.fn()
const parseTeamSessionOwnershipOwnerIdMock = vi.fn()
const getTeamDefinitionForThreadMock = vi.fn()
const getTeamRuntimeServiceMock = vi.fn()
const sessionHasUserMessagesMock = vi.fn()
const setInitialStandaloneSessionTitleMock = vi.fn()
const maybeGenerateStandaloneSessionTitleMock = vi.fn()
const setInitialTeamThreadNameMock = vi.fn()
const maybeGenerateTeamThreadNameMock = vi.fn()
const resolveTeamSessionSettlementOutcomeMock = vi.fn()
const prepareAssistantChatRequestMock = vi.fn()
const countRunningSessionsMock = vi.fn()
const publishProjectionConsumedMock = vi.fn()
const listWorkspaceAgentsForDirMock = vi.fn()
const assertRuntimeModelPromptableMock = vi.fn()

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        instance: {
            dispose: disposeInstanceMock,
        },
        session: {
            promptAsync: promptAsyncMock,
        },
    }),
}))

vi.mock('../../lib/model-catalog.js', () => ({
    assertRuntimeModelPromptable: assertRuntimeModelPromptableMock,
}))

vi.mock('../opencode-projection/workspace-agent-projection-service.js', () => ({
    ensureAgentProjection: ensureAgentProjectionMock,
}))

vi.mock('./session-ownership-service.js', () => ({
    createSessionOwnership: vi.fn(),
    parseTeamSessionOwnershipOwnerId: parseTeamSessionOwnershipOwnerIdMock,
    resolveSessionOwnership: vi.fn(),
}))

vi.mock('../team-runtime/team-runtime-service.js', () => ({
    getTeamDefinitionForThread: getTeamDefinitionForThreadMock,
    getTeamRuntimeService: getTeamRuntimeServiceMock,
}))

vi.mock('./thread-title-service.js', () => ({
    sessionHasUserMessages: sessionHasUserMessagesMock,
    setInitialStandaloneSessionTitle: setInitialStandaloneSessionTitleMock,
    maybeGenerateStandaloneSessionTitle: maybeGenerateStandaloneSessionTitleMock,
    setInitialTeamThreadName: setInitialTeamThreadNameMock,
    maybeGenerateTeamThreadName: maybeGenerateTeamThreadNameMock,
}))

vi.mock('../team-runtime/team-session-settlement.js', () => ({
    formatTeamSessionError: vi.fn(() => 'Team session failed'),
    resolveTeamSessionSettlementOutcome: resolveTeamSessionSettlementOutcomeMock,
}))

vi.mock('../studio-assistant/assistant-chat-service.js', () => ({
    prepareAssistantChatRequest: prepareAssistantChatRequestMock,
}))

vi.mock('../runtime/reload-service.js', () => ({
    countRunningSessions: countRunningSessionsMock,
}))

vi.mock('../runtime/execution-events.js', () => ({
    publishProjectionConsumed: publishProjectionConsumedMock,
}))

vi.mock('../workspace/service.js', () => ({
    listWorkspaceAgentsForDir: listWorkspaceAgentsForDirMock,
}))

describe('sendStudioChatMessage', () => {
    beforeEach(() => {
        promptAsyncMock.mockReset().mockResolvedValue({ data: undefined })
        disposeInstanceMock.mockReset().mockResolvedValue(undefined)
        parseTeamSessionOwnershipOwnerIdMock.mockReset().mockReturnValue(null)
        getTeamDefinitionForThreadMock.mockReset().mockResolvedValue(null)
        getTeamRuntimeServiceMock.mockReset().mockReturnValue({
            beginUserTurn: vi.fn().mockResolvedValue(undefined),
            markParticipantSessionBusy: vi.fn().mockResolvedValue(undefined),
            drainParticipantQueue: vi.fn().mockResolvedValue(undefined),
            tripParticipantAutoWakeCircuit: vi.fn().mockResolvedValue(undefined),
            clearParticipantAutoWakeCircuit: vi.fn().mockResolvedValue(undefined),
        })
        sessionHasUserMessagesMock.mockReset().mockResolvedValue(true)
        setInitialStandaloneSessionTitleMock.mockReset().mockResolvedValue(true)
        maybeGenerateStandaloneSessionTitleMock.mockReset().mockResolvedValue(true)
        setInitialTeamThreadNameMock.mockReset().mockResolvedValue(true)
        maybeGenerateTeamThreadNameMock.mockReset().mockResolvedValue(true)
        resolveTeamSessionSettlementOutcomeMock.mockReset().mockResolvedValue({ kind: 'settled' })
        countRunningSessionsMock.mockReset().mockResolvedValue({ runningSessions: 0 })
        publishProjectionConsumedMock.mockReset()
        listWorkspaceAgentsForDirMock.mockReset().mockResolvedValue([])
        assertRuntimeModelPromptableMock.mockReset().mockResolvedValue(undefined)
        prepareAssistantChatRequestMock.mockReset().mockResolvedValue({
            assistantAgentName: 'apm-studio/studio-assistant',
            capabilitySnapshot: null,
            promptTools: {
                apply_studio_actions: true,
            },
            systemPrompt: 'Assistant system prompt',
        })
        ensureAgentProjectionMock.mockReset().mockResolvedValue({
            compiled: {
                agentNames: {
                    build: 'apm-studio/workspace/hash/agent-1--build',
                },
            },
            toolResolution: {
                selectedMcpServers: ['playwright'],
                requestedTools: ['playwright_*'],
                availableTools: ['playwright_*'],
                resolvedTools: ['playwright_*'],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {
                'playwright_*': true,
            },
            capabilitySnapshot: null,
            changed: false,
        })
    })

    it('passes resolved MCP tools to the prompt request', async () => {
        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-1',
            {
                message: 'Use Playwright MCP if available.',
                agent: {
                    agentId: 'agent-1',
                    agentName: 'Agent',
                    skillRefs: [],
                    model: {
                        provider: 'ollama-cloud',
                        modelId: 'gpt-oss:120b',
                    },
                    mcpServerNames: ['playwright'],
                },
            },
        )

        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            sessionID: 'session-1',
            directory: '/tmp/workspace',
            agent: 'apm-studio/workspace/hash/agent-1--build',
            tools: {
                'playwright_*': true,
            },
        }))
    })

    it('blocks unsupported selected models before projection or prompt execution', async () => {
        assertRuntimeModelPromptableMock.mockRejectedValueOnce(
            new Error('The selected model (gpt-5.5-pro) is not supported when using Codex with a ChatGPT account.'),
        )
        const { sendStudioChatMessage } = await import('./message-service.js')

        await expect(sendStudioChatMessage(
            '/tmp/workspace',
            'session-1',
            {
                message: 'Run this turn.',
                agent: {
                    agentId: 'agent-1',
                    agentName: 'Agent',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5.5-pro',
                    },
                    mcpServerNames: [],
                },
            },
        )).rejects.toThrow('gpt-5.5-pro')

        expect(ensureAgentProjectionMock).not.toHaveBeenCalled()
        expect(promptAsyncMock).not.toHaveBeenCalled()
    })

    it('publishes projection consumption after a successful execution-boundary dispose', async () => {
        ensureAgentProjectionMock.mockResolvedValueOnce({
            compiled: {
                agentNames: {
                    build: 'apm-studio/workspace/hash/agent-1--build',
                },
            },
            toolResolution: {
                selectedMcpServers: [],
                requestedTools: [],
                availableTools: [],
                resolvedTools: [],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {},
            capabilitySnapshot: null,
            changed: true,
        })

        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-1',
            {
                message: 'Run with the latest projection.',
                agent: {
                    agentId: 'agent-1',
                    agentName: 'Agent',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                    mcpServerNames: [],
                },
            },
        )

        expect(publishProjectionConsumedMock).toHaveBeenCalledWith('/tmp/workspace', {
            agentIds: ['agent-1'],
        })
    })

    it('adopts the hinted dirty standalone projection scope in one execution boundary', async () => {
        listWorkspaceAgentsForDirMock.mockResolvedValue([
            {
                id: 'agent-1',
                name: 'Agent 1',
                model: { provider: 'openai', modelId: 'gpt-5' },
                skillRefs: [],
                mcpServerNames: [],
            },
            {
                id: 'agent-2',
                name: 'Agent 2',
                model: { provider: 'openai', modelId: 'gpt-5' },
                skillRefs: [],
                mcpServerNames: [],
            },
        ])
        ensureAgentProjectionMock.mockImplementation(async ({ agentId }: { agentId: string }) => ({
            compiled: {
                agentNames: {
                    build: `apm-studio/workspace/hash/${agentId}--build`,
                },
            },
            toolResolution: {
                selectedMcpServers: [],
                requestedTools: [],
                availableTools: [],
                resolvedTools: [],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {},
            capabilitySnapshot: null,
            changed: agentId === 'agent-2',
        }))

        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-1',
            {
                message: 'Run with the latest projection.',
                projectionScope: {
                    agentIds: ['agent-2'],
                },
                agent: {
                    agentId: 'agent-1',
                    agentName: 'Agent 1',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                    mcpServerNames: [],
                },
            },
        )

        expect(ensureAgentProjectionMock).toHaveBeenCalledTimes(2)
        expect(ensureAgentProjectionMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
            agentId: 'agent-1',
        }))
        expect(ensureAgentProjectionMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
            agentId: 'agent-2',
        }))
        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            agent: 'apm-studio/workspace/hash/agent-1--build',
        }))
        expect(publishProjectionConsumedMock).toHaveBeenCalledWith('/tmp/workspace', {
            agentIds: ['agent-1', 'agent-2'],
        })
    })

    it('starts standalone title generation on the first user message', async () => {
        sessionHasUserMessagesMock.mockResolvedValue(false)

        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-standalone',
            {
                message: 'Design a roadmap for the release branch.',
                agent: {
                    agentId: 'agent-1',
                    agentName: 'Planner',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                },
            },
        )

        expect(setInitialStandaloneSessionTitleMock).toHaveBeenCalledWith({
            sessionId: 'session-standalone',
            provisionalTitle: 'Design a roadmap for the release branch.',
        })
        expect(maybeGenerateStandaloneSessionTitleMock).toHaveBeenCalledWith({
            workingDir: '/tmp/workspace',
            sessionId: 'session-standalone',
            message: 'Design a roadmap for the release branch.',
            model: {
                providerId: 'openai',
                modelId: 'gpt-5',
            },
            provisionalTitle: 'Design a roadmap for the release branch.',
        })
        expect(setInitialTeamThreadNameMock).not.toHaveBeenCalled()
        expect(maybeGenerateTeamThreadNameMock).not.toHaveBeenCalled()
    })

    it('starts Team thread naming from the first user message without renaming the participant session', async () => {
        sessionHasUserMessagesMock.mockResolvedValue(false)
        parseTeamSessionOwnershipOwnerIdMock.mockReturnValue({
            teamId: 'team-1',
            threadId: 'thread-1',
            participantKey: 'Lead',
        })

        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-team',
            {
                message: 'Investigate the API regression and propose next steps.',
                agent: {
                    agentId: 'team:team-1:thread:thread-1:participant:Lead',
                    agentName: 'Lead',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                },
                teamId: 'team-1',
                teamThreadId: 'thread-1',
            },
        )

        expect(setInitialTeamThreadNameMock).toHaveBeenCalledWith({
            workingDir: '/tmp/workspace',
            teamId: 'team-1',
            threadId: 'thread-1',
            provisionalTitle: 'Investigate the API regression and propose next steps.',
        })
        expect(maybeGenerateTeamThreadNameMock).toHaveBeenCalledWith({
            workingDir: '/tmp/workspace',
            teamId: 'team-1',
            threadId: 'thread-1',
            message: 'Investigate the API regression and propose next steps.',
            model: {
                providerId: 'openai',
                modelId: 'gpt-5',
            },
            provisionalTitle: 'Investigate the API regression and propose next steps.',
        })
        expect(setInitialStandaloneSessionTitleMock).not.toHaveBeenCalled()
        expect(maybeGenerateStandaloneSessionTitleMock).not.toHaveBeenCalled()
    })

    it('does not widen Team participant projection adoption scope from the target team alone', async () => {
        listWorkspaceAgentsForDirMock.mockResolvedValue([
            {
                id: 'agent-1',
                name: 'Agent 1',
                model: { provider: 'openai', modelId: 'gpt-5' },
                skillRefs: [],
                mcpServerNames: [],
            },
            {
                id: 'agent-2',
                name: 'Agent 2',
                model: { provider: 'openai', modelId: 'gpt-5' },
                skillRefs: [],
                mcpServerNames: [],
            },
        ])
        parseTeamSessionOwnershipOwnerIdMock.mockReturnValue({
            teamId: 'team-1',
            threadId: 'thread-1',
            participantKey: 'Lead',
        })
        getTeamDefinitionForThreadMock.mockResolvedValue({
            id: 'team-1',
            name: 'Team 1',
            participants: {
                Lead: { agentRef: { kind: 'draft', draftId: 'lead' } },
            },
            relations: [],
            teamRules: [],
        })
        ensureAgentProjectionMock.mockImplementation(async ({ agentId }: { agentId: string }) => ({
            compiled: {
                agentNames: {
                    build: `apm-studio/workspace/hash/${agentId}--build`,
                },
            },
            toolResolution: {
                selectedMcpServers: [],
                requestedTools: [],
                availableTools: [],
                resolvedTools: [],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {},
            capabilitySnapshot: null,
            changed: false,
        }))

        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-team',
            {
                message: 'Run only this participant with the latest agent projection.',
                agent: {
                    agentId: 'team:team-1:thread:thread-1:participant:Lead',
                    agentName: 'Lead',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                    mcpServerNames: [],
                },
                teamId: 'team-1',
                teamThreadId: 'thread-1',
            },
        )

        expect(ensureAgentProjectionMock).toHaveBeenCalledTimes(1)
    })

    it('injects Team collaboration context into a turn-scoped system prompt instead of the projected agent file', async () => {
        parseTeamSessionOwnershipOwnerIdMock.mockReturnValue({
            teamId: 'team-1',
            threadId: 'thread-1',
            participantKey: 'Lead',
        })
        getTeamDefinitionForThreadMock.mockResolvedValue({
            id: 'team-1',
            name: 'Review Team',
            participants: {
                Lead: { agentRef: { kind: 'draft', draftId: 'lead' } },
                Researcher: { agentRef: { kind: 'draft', draftId: 'researcher' } },
            },
            relations: [{
                id: 'rel-1',
                between: ['Lead', 'Researcher'],
                direction: 'both',
                name: 'Review Loop',
            }],
        })

        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-team',
            {
                message: 'Please review the latest findings.',
                agent: {
                    agentId: 'team:team-1:thread:thread-1:participant:Lead',
                    agentName: 'Lead',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                },
                teamId: 'team-1',
                teamThreadId: 'thread-1',
            },
        )

        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            system: expect.stringContaining('# Team Runtime Context'),
        }))
        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            parts: [{
                type: 'text',
                text: 'Please review the latest findings.',
            }],
        }))
    })

    it('keeps assistant system context out of the user text payload', async () => {
        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-assistant',
            {
                message: 'Create a new agent.',
                agent: {
                    agentId: 'studio-assistant',
                    agentName: 'APM Assistant',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5',
                    },
                },
            },
        )

        expect(prepareAssistantChatRequestMock).toHaveBeenCalledWith('/tmp/workspace', expect.objectContaining({
            message: 'Create a new agent.',
        }))
        expect(promptAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            agent: 'apm-studio/studio-assistant',
            system: 'Assistant system prompt',
            parts: [{
                type: 'text',
                text: 'Create a new agent.',
            }],
        }))
    })

    it('disposes and retries once when OpenCode reports an team agent registry miss', async () => {
        parseTeamSessionOwnershipOwnerIdMock.mockReturnValue({
            teamId: 'team-1',
            threadId: 'thread-1',
            participantKey: 'Lead',
        })
        ensureAgentProjectionMock.mockResolvedValue({
            compiled: {
                agentNames: {
                    build: 'apm-studio/team/hash/participant-lead--build',
                },
            },
            toolResolution: {
                selectedMcpServers: [],
                requestedTools: [],
                availableTools: [],
                resolvedTools: [],
                unavailableTools: [],
                unavailableDetails: [],
            },
            toolMap: {},
            capabilitySnapshot: null,
        })
        promptAsyncMock
            .mockRejectedValueOnce(new Error('Agent not found: "apm-studio/team/hash/participant-lead--build". Available agents: build'))
            .mockResolvedValueOnce({ data: undefined })

        const { sendStudioChatMessage } = await import('./message-service.js')

        await sendStudioChatMessage(
            '/tmp/workspace',
            'session-team',
            {
                message: 'Please continue the handoff.',
                agent: {
                    agentId: 'team:team-1:thread:thread-1:participant:Lead',
                    agentName: 'Lead',
                    skillRefs: [],
                    model: {
                        provider: 'openai',
                        modelId: 'gpt-5.4',
                    },
                },
                teamId: 'team-1',
                teamThreadId: 'thread-1',
            },
        )

        expect(disposeInstanceMock).toHaveBeenCalledTimes(1)
        expect(disposeInstanceMock).toHaveBeenCalledWith({ directory: '/tmp/workspace' })
        expect(promptAsyncMock).toHaveBeenCalledTimes(2)
        expect(promptAsyncMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
            agent: 'apm-studio/team/hash/participant-lead--build',
        }))
        expect(promptAsyncMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
            agent: 'apm-studio/team/hash/participant-lead--build',
        }))
    })
})
