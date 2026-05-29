import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { TeamDefinition, MailboxEvent } from '../../../shared/team-types.js'

const promptAsync = vi.fn()
const disposeInstance = vi.fn()
const sessionMessages = vi.fn()
const waitForSessionToSettle = vi.fn()
const resolveSessionExecutionContext = vi.fn()
const resolveAgentForWake = vi.fn()
const prepareRuntimeForExecution = vi.fn()
const countRunningSessions = vi.fn()
const ensureAgentProjection = vi.fn()
const assertRuntimeModelPromptable = vi.fn()

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        instance: {
            dispose: disposeInstance,
        },
        session: {
            promptAsync,
            messages: sessionMessages,
        },
    }),
}))

vi.mock('../../lib/model-catalog.js', () => ({
    assertRuntimeModelPromptable,
}))

vi.mock('../../lib/chat-session.js', () => ({
    waitForSessionToSettle,
    extractNonRetryableSessionError: vi.fn(() => null),
}))

vi.mock('../chat/session-ownership-service.js', () => ({
    resolveSessionOwnership: resolveSessionExecutionContext,
}))

vi.mock('./wake-agent-resolver.js', () => ({
    resolveAgentForWake,
}))

vi.mock('../runtime/preparation-service.js', () => ({
    prepareRuntimeForExecution,
}))

vi.mock('../runtime/reload-service.js', () => ({
    countRunningSessions,
}))

vi.mock('../opencode-projection/workspace-agent-projection-service.js', () => ({
    ensureAgentProjection,
}))

const teamDefinition: TeamDefinition = {
    id: 'team-review',
    name: 'Review Team',
    participants: {
        Lead: {
            agentRef: { kind: 'draft', draftId: 'lead-v1' },
            displayName: 'Lead',
        },
        Researcher: {
            agentRef: { kind: 'draft', draftId: 'researcher-v1' },
            displayName: 'Researcher',
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['Lead', 'Researcher'],
            direction: 'both',
            name: 'Review Loop',
            description: 'Exchange findings.',
        },
    ],
}

describe('wake-cascade participant scheduling', () => {
    let tempDir: string

    beforeEach(async () => {
        vi.resetModules()
        vi.useRealTimers()
        promptAsync.mockReset().mockResolvedValue({ data: { ok: true } })
        disposeInstance.mockReset().mockResolvedValue(undefined)
        sessionMessages.mockReset().mockResolvedValue({ data: [] })
        waitForSessionToSettle.mockReset().mockResolvedValue(true)
        resolveAgentForWake.mockReset().mockResolvedValue(null)
        ensureAgentProjection.mockReset().mockResolvedValue({
            changed: false,
            compiled: {
                agentNames: {
                    build: 'apm-studio/team/hash/Researcher--build',
                },
            },
            toolMap: {
                message_teammate: true,
            },
        })
        prepareRuntimeForExecution.mockReset().mockImplementation(async (_workingDir: string, buildPayload: () => Promise<unknown>) => ({
            appliedReload: false,
            requiresDispose: false,
            blocked: false,
            reason: null,
            payload: await buildPayload(),
        }))
        countRunningSessions.mockReset().mockResolvedValue({ runningSessions: 0 })
        assertRuntimeModelPromptable.mockReset().mockResolvedValue(undefined)
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-wake-cascade-'))
        resolveSessionExecutionContext.mockReset().mockResolvedValue({ workingDir: tempDir })
    })

    afterEach(async () => {
        vi.useRealTimers()
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('queues teammate wakes when the same participant is still running, then drains them after settlement', async () => {
        const { Mailbox } = await import('./mailbox.js')
        const {
            processWakeCascade,
            drainParticipantQueueAfterSettlement,
        } = await import('./wake-cascade.js')
        const { markParticipantQueueRunning } = await import('./wake-participant-state.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-1'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please review the board update.',
            threadId,
        })

        const event: MailboxEvent = {
            id: 'evt-1',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                from: 'Lead',
                to: 'Researcher',
                threadId,
            },
        }

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getAgentSession: vi.fn().mockImplementation((_tid: string, participantKey: string) =>
                participantKey === 'Researcher' ? 'session-researcher' : null,
            ),
            getOrCreateSession: vi.fn(),
            setParticipantStatus: vi.fn().mockResolvedValue(undefined),
        } as const

        markParticipantQueueRunning(threadId, 'Researcher')

        const queued = await processWakeCascade(
            event,
            teamDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(queued.injected).toEqual([])
        expect(queued.queued).toEqual(['Researcher'])
        expect(promptAsync).not.toHaveBeenCalled()

        const drained = await drainParticipantQueueAfterSettlement(
            'Researcher',
            teamDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(drained.injected).toEqual(['Researcher'])
        expect(promptAsync).toHaveBeenCalledTimes(1)
        expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({
            sessionID: 'session-researcher',
            directory: tempDir,
        }))
    })

    it('injects different participant wakes without waiting for another participant to settle', async () => {
        const { Mailbox } = await import('./mailbox.js')
        const {
            processWakeCascade,
        } = await import('./wake-cascade.js')
        const { markParticipantQueueRunning } = await import('./wake-participant-state.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-2'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please review the board update.',
            threadId,
        })

        const secondTeamDefinition: TeamDefinition = {
            ...teamDefinition,
            participants: {
                Researcher: {
                    agentRef: { kind: 'draft', draftId: 'researcher-v1' },
                    displayName: 'Researcher',
                    subscriptions: {
                        callboardKeys: ['shared/*'],
                    },
                },
                Reviewer: {
                    agentRef: { kind: 'draft', draftId: 'reviewer-v1' },
                    displayName: 'Reviewer',
                    subscriptions: {
                        callboardKeys: ['shared/*'],
                    },
                },
                Lead: teamDefinition.participants.Lead,
            },
            relations: [
                ...teamDefinition.relations,
                {
                    id: 'rel-2',
                    between: ['Lead', 'Reviewer'],
                    direction: 'both',
                    name: 'Review Coordination',
                    description: 'Exchange findings.',
                },
            ],
        }

        const event: MailboxEvent = {
            id: 'evt-2',
            type: 'board.updated',
            sourceType: 'agent',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                key: 'shared/review-summary',
                author: 'Lead',
                kind: 'artifact',
                threadId,
            },
        }

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getAgentSession: vi.fn().mockImplementation((_tid: string, participantKey: string) => {
                if (participantKey === 'Researcher') return 'session-researcher'
                if (participantKey === 'Reviewer') return 'session-reviewer'
                return null
            }),
            getOrCreateSession: vi.fn(),
            setParticipantStatus: vi.fn().mockResolvedValue(undefined),
        } as const

        markParticipantQueueRunning(threadId, 'Lead')

        const cascade = await processWakeCascade(
            event,
            secondTeamDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(cascade.injected.sort()).toEqual(['Researcher', 'Reviewer'])
        expect(cascade.queued).toEqual([])
        expect(promptAsync).toHaveBeenCalledTimes(2)
        expect(promptAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({
            sessionID: 'session-researcher',
            directory: tempDir,
        }))
        expect(promptAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({
            sessionID: 'session-reviewer',
            directory: tempDir,
        }))
    })

    it('defers blocked participant wakes and retries them after the working directory becomes idle', async () => {
        vi.useFakeTimers()

        const { Mailbox } = await import('./mailbox.js')
        const { BLOCKED_PROJECTION_RETRY_MESSAGE, processWakeCascade } = await import('./wake-cascade.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-3'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please review this when you can.',
            threadId,
        })

        const event: MailboxEvent = {
            id: 'evt-3',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                from: 'Lead',
                to: 'Researcher',
                threadId,
            },
        }

        resolveAgentForWake.mockResolvedValue({
            agentId: 'researcher-v1',
            agentName: 'Researcher',
            instructionRef: null,
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
        })
        prepareRuntimeForExecution
            .mockResolvedValueOnce({
                appliedReload: false,
                requiresDispose: true,
                blocked: true,
                reason: 'projection_update_pending',
                payload: {
                    changed: true,
                    compiled: { agentNames: {} },
                    toolMap: {},
                },
            })
            .mockResolvedValueOnce({
                appliedReload: true,
                requiresDispose: true,
                blocked: false,
                reason: null,
                payload: {
                    changed: true,
                    compiled: { agentNames: {} },
                    toolMap: {},
                },
            })
        countRunningSessions
            .mockResolvedValueOnce({ runningSessions: 1 })
            .mockResolvedValueOnce({ runningSessions: 0 })

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getAgentSession: vi.fn().mockReturnValue('session-researcher'),
            getOrCreateSession: vi.fn(),
            setParticipantStatus: vi.fn().mockResolvedValue(undefined),
        } as const

        const cascade = await processWakeCascade(
            event,
            teamDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(cascade.injected).toEqual([])
        expect(cascade.queued).toEqual(['Researcher'])
        expect(promptAsync).not.toHaveBeenCalled()
        expect(mailbox.getMessagesFor('Researcher')).toHaveLength(1)
        expect(threadManager.setParticipantStatus).toHaveBeenCalledWith(threadId, 'Researcher', { type: 'busy' })
        expect(threadManager.setParticipantStatus).toHaveBeenCalledWith(
            threadId,
            'Researcher',
            {
                type: 'retry',
                message: BLOCKED_PROJECTION_RETRY_MESSAGE,
            },
        )

        await vi.advanceTimersByTimeAsync(500)
        await vi.waitFor(() => {
            expect(promptAsync).toHaveBeenCalledTimes(1)
        })
        expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({
            sessionID: 'session-researcher',
            directory: tempDir,
        }))
        expect(mailbox.getMessagesFor('Researcher')).toHaveLength(0)
    })

    it('injects Team collaboration context into successful agent wake system prompts', async () => {
        const { Mailbox } = await import('./mailbox.js')
        const { processWakeCascade } = await import('./wake-cascade.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-4'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please review this handoff.',
            tag: 'handoff',
            threadId,
        })

        const event: MailboxEvent = {
            id: 'evt-4',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                from: 'Lead',
                to: 'Researcher',
                tag: 'handoff',
                threadId,
            },
        }

        resolveAgentForWake.mockResolvedValue({
            agentId: 'researcher-v1',
            agentName: 'Researcher',
            instructionRef: null,
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
        })

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getAgentSession: vi.fn().mockReturnValue('session-researcher'),
            getOrCreateSession: vi.fn(),
            setParticipantStatus: vi.fn().mockResolvedValue(undefined),
        } as const

        const cascade = await processWakeCascade(
            event,
            teamDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(cascade.injected).toEqual(['Researcher'])
        expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({
            sessionID: 'session-researcher',
            system: expect.stringContaining('# Team Runtime Context'),
        }))
        expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({
            parts: [{
                type: 'text',
                text: expect.stringContaining('Please review this handoff.'),
            }],
        }))
    })

    it('opens a participant circuit when wake injection uses an unsupported selected model', async () => {
        const { Mailbox } = await import('./mailbox.js')
        const { StudioValidationError } = await import('../../lib/opencode-errors.js')
        const { processWakeCascade } = await import('./wake-cascade.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-unsupported-model'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please review this handoff.',
            threadId,
        })

        const event: MailboxEvent = {
            id: 'evt-unsupported-model',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                from: 'Lead',
                to: 'Researcher',
                threadId,
            },
        }

        resolveAgentForWake.mockResolvedValue({
            agentId: 'researcher-v1',
            agentName: 'Researcher',
            instructionRef: null,
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.5-pro' },
            modelVariant: null,
            mcpServerNames: [],
        })
        assertRuntimeModelPromptable.mockRejectedValueOnce(
            new StudioValidationError(
                'The selected model (gpt-5.5-pro) is not supported when using Codex with a ChatGPT account.',
                'choose_model',
            ),
        )

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getAgentSession: vi.fn().mockReturnValue('session-researcher'),
            getOrCreateSession: vi.fn(),
            setParticipantStatus: vi.fn().mockResolvedValue(undefined),
        } as const

        const cascade = await processWakeCascade(
            event,
            teamDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(cascade.injected).toEqual([])
        expect(cascade.errors).toEqual([
            expect.stringContaining('gpt-5.5-pro'),
        ])
        expect(ensureAgentProjection).not.toHaveBeenCalled()
        expect(promptAsync).not.toHaveBeenCalled()
        expect(threadManager.setParticipantStatus).toHaveBeenCalledWith(
            threadId,
            'Researcher',
            {
                type: 'error',
                message: expect.stringContaining('gpt-5.5-pro'),
            },
        )
    })

    it('disposes and retries once when a wake hits an team agent registry miss', async () => {
        const { Mailbox } = await import('./mailbox.js')
        const { processWakeCascade } = await import('./wake-cascade.js')

        const mailbox = new Mailbox()
        const threadId = 'thread-5'
        mailbox.addMessage({
            from: 'Lead',
            to: 'Researcher',
            content: 'Please resume your analysis.',
            threadId,
        })

        const event: MailboxEvent = {
            id: 'evt-5',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'Lead',
            timestamp: Date.now(),
            payload: {
                from: 'Lead',
                to: 'Researcher',
                threadId,
            },
        }

        resolveAgentForWake.mockResolvedValue({
            agentId: 'researcher-v1',
            agentName: 'Researcher',
            instructionRef: null,
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
        })
        ensureAgentProjection.mockResolvedValue({
            changed: true,
            compiled: {
                agentNames: {
                    build: 'apm-studio/team/hash/participant-researcher--build',
                },
            },
            toolMap: {
                message_teammate: true,
            },
        })
        promptAsync
            .mockRejectedValueOnce(new Error('Agent not found: "apm-studio/team/hash/participant-researcher--build". Available agents: build'))
            .mockResolvedValueOnce({ data: { ok: true } })

        const threadManager = {
            workingDir: tempDir,
            getRecentEvents: vi.fn().mockResolvedValue([]),
            getAgentSession: vi.fn().mockReturnValue('session-researcher'),
            getOrCreateSession: vi.fn(),
            setParticipantStatus: vi.fn().mockResolvedValue(undefined),
        } as const

        const cascade = await processWakeCascade(
            event,
            teamDefinition,
            mailbox,
            threadManager as never,
            threadId,
            tempDir,
        )

        expect(cascade.injected).toEqual(['Researcher'])
        expect(disposeInstance).toHaveBeenCalledTimes(1)
        expect(disposeInstance).toHaveBeenCalledWith({ directory: tempDir })
        expect(promptAsync).toHaveBeenCalledTimes(2)
        expect(promptAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({
            agent: 'apm-studio/team/hash/participant-researcher--build',
        }))
        expect(promptAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({
            agent: 'apm-studio/team/hash/participant-researcher--build',
        }))
    })
})
