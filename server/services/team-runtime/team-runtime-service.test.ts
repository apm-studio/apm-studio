import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { TeamDefinition, WakeCondition } from '../../../shared/team-types.js'

const ensureAgentProjectionMock = vi.fn()
const clearParticipantCircuitMock = vi.fn()
const clearParticipantQueueRunningMock = vi.fn()
const drainParticipantQueueAfterSettlementMock = vi.fn()
const markParticipantQueueRunningMock = vi.fn()
const processWakeCascadeMock = vi.fn()
const processWakeTargetsMock = vi.fn()
const tripParticipantCircuitMock = vi.fn()
const sessionStatusMock = vi.fn()
const sessionMessagesMock = vi.fn()
const sessionDeleteMock = vi.fn()

vi.mock('../opencode-projection/workspace-agent-projection-service.js', () => ({
    ensureAgentProjection: ensureAgentProjectionMock,
}))

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        session: {
            status: sessionStatusMock,
            messages: sessionMessagesMock,
            delete: sessionDeleteMock,
        },
    }),
}))

vi.mock('./wake-cascade.js', () => ({
    BLOCKED_PROJECTION_RETRY_MESSAGE: 'Waiting for the current workspace run to finish before applying projection changes.',
    clearParticipantCircuit: clearParticipantCircuitMock,
    clearParticipantQueueRunning: clearParticipantQueueRunningMock,
    drainParticipantQueueAfterSettlement: drainParticipantQueueAfterSettlementMock,
    markParticipantQueueRunning: markParticipantQueueRunningMock,
    processWakeCascade: processWakeCascadeMock,
    processWakeTargets: processWakeTargetsMock,
    tripParticipantCircuit: tripParticipantCircuitMock,
}))

const teamDefinition: TeamDefinition = {
    id: 'team-invest',
    name: 'Investment Team',
    participants: {
        Head: {
            agentRef: { kind: 'draft', draftId: 'agent-head' },
            subscriptions: {
                eventTypes: ['runtime.idle'],
            },
        },
        Analyst: {
            agentRef: { kind: 'draft', draftId: 'agent-analyst' },
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['Head', 'Analyst'],
            direction: 'both',
            name: 'Delegation',
            description: 'Exchange research updates.',
        },
    ],
}

describe('TeamRuntimeService projection prewarm', () => {
    let studioDir: string
    let workingDir: string

    beforeEach(async () => {
        studioDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-team-service-'))
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-working-'))
        process.env.APM_STUDIO_HOME = studioDir
        vi.resetModules()
        ensureAgentProjectionMock.mockReset().mockResolvedValue({
            compiled: {},
            toolResolution: {},
            toolMap: {},
            capabilitySnapshot: null,
            changed: true,
        })
        clearParticipantCircuitMock.mockReset()
        clearParticipantQueueRunningMock.mockReset()
        drainParticipantQueueAfterSettlementMock.mockReset()
        markParticipantQueueRunningMock.mockReset()
        processWakeCascadeMock.mockReset().mockResolvedValue({
            targets: [],
            injected: [],
            queued: [],
            errors: [],
        })
        processWakeTargetsMock.mockReset().mockResolvedValue({
            targets: [],
            injected: [],
            queued: [],
            errors: [],
        })
        tripParticipantCircuitMock.mockReset()
        sessionStatusMock.mockReset().mockResolvedValue({ data: {} })
        sessionMessagesMock.mockReset().mockResolvedValue({ data: [] })
        sessionDeleteMock.mockReset().mockResolvedValue({ data: { ok: true } })

        const { workspaceIdForDir, workspaceDir } = await import('../../lib/config.js')
        const wsDir = workspaceDir(workspaceIdForDir(workingDir))
        await fs.mkdir(wsDir, { recursive: true })
        const workspace = {
            workingDir,
            agents: [
                {
                    id: 'agent-head',
                    name: 'Head Agent',
                    model: { provider: 'openai', modelId: 'gpt-5.4' },
                    skillRefs: [],
                    mcpServerNames: [],
                },
                {
                    id: 'agent-analyst',
                    name: 'Analyst Agent',
                    model: { provider: 'openai', modelId: 'gpt-5.4' },
                    skillRefs: [],
                    mcpServerNames: [],
                },
            ],
        }
        await fs.writeFile(path.join(wsDir, 'workspace.json'), JSON.stringify({
            schemaVersion: 1,
            product: 'APM Studio',
            workingDir,
            savedAt: Date.now(),
            workspace,
        }, null, 2), 'utf-8')
    })

    afterEach(async () => {
        vi.useRealTimers()
        delete process.env.APM_STUDIO_HOME
        await fs.rm(studioDir, { recursive: true, force: true }).catch(() => {})
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        vi.resetModules()
    })

    it('prewarms participant projections when a thread is created', async () => {
        const { getTeamRuntimeService } = await import('./team-runtime-service.js')

        const result = await getTeamRuntimeService(workingDir).createThread(teamDefinition.id, teamDefinition)

        expect(result.ok).toBe(true)
        expect(ensureAgentProjectionMock).toHaveBeenCalledTimes(2)
        expect(ensureAgentProjectionMock).toHaveBeenCalledWith(expect.objectContaining({
            agentId: 'agent-head',
            agentName: 'Head Agent',
        }))
        expect(ensureAgentProjectionMock).toHaveBeenCalledWith(expect.objectContaining({
            agentId: 'agent-analyst',
            agentName: 'Analyst Agent',
        }))
    })

    it('emits a single runtime idle follow-up without recursively re-emitting idle', async () => {
        processWakeCascadeMock
            .mockResolvedValueOnce({
                targets: [{ participantKey: 'Analyst', reason: 'subscription' }],
                injected: ['Analyst'],
                queued: [],
                errors: [],
            })
            .mockResolvedValueOnce({
                targets: [{ participantKey: 'Head', reason: 'subscription' }],
                injected: ['Head'],
                queued: [],
                errors: [],
            })

        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)

        const created = await service.createThread(teamDefinition.id, teamDefinition)
        expect(created.ok).toBe(true)

        const sent = await service.sendMessage(created.thread.id, {
            from: 'Head',
            to: 'Analyst',
            content: 'Review the latest memo.',
            tag: 'handoff',
        })
        expect(sent.ok).toBe(true)

        await vi.waitFor(() => {
            expect(processWakeCascadeMock).toHaveBeenCalledTimes(2)
        })

        const events = await service.getRecentEvents(created.thread.id)
        expect(events.ok).toBe(true)
        expect(events.events.filter((event) => event.type === 'runtime.idle')).toHaveLength(1)
        expect(processWakeCascadeMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
            type: 'message.sent',
            sourceType: 'agent',
            source: 'Head',
        }))
        expect(processWakeCascadeMock.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
            type: 'runtime.idle',
            sourceType: 'system',
            source: 'runtime',
        }))

        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(processWakeCascadeMock).toHaveBeenCalledTimes(2)
    })

    it('does not emit runtime idle when the cascade only queued blocked work', async () => {
        processWakeCascadeMock.mockResolvedValueOnce({
            targets: [{ participantKey: 'Analyst', reason: 'subscription' }],
            injected: [],
            queued: ['Analyst'],
            errors: [],
        })

        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)

        const created = await service.createThread(teamDefinition.id, teamDefinition)
        expect(created.ok).toBe(true)

        const sent = await service.sendMessage(created.thread.id, {
            from: 'Head',
            to: 'Analyst',
            content: 'Review the latest memo.',
            tag: 'handoff',
        })
        expect(sent.ok).toBe(true)

        await vi.waitFor(() => {
            expect(processWakeCascadeMock).toHaveBeenCalledTimes(1)
        })

        const events = await service.getRecentEvents(created.thread.id)
        expect(events.ok).toBe(true)
        expect(events.events.filter((event) => event.type === 'runtime.idle')).toHaveLength(0)
    })

    it('immediately re-queues an already satisfied wait condition', async () => {
        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)
        const created = await service.createThread(teamDefinition.id, teamDefinition)
        expect(created.ok).toBe(true)

        const boardResult = await service.postToBoard(created.thread.id, {
            author: 'Head',
            key: 'review-summary',
            kind: 'artifact',
            content: 'Summary is ready.',
        })
        expect(boardResult.ok).toBe(true)
        processWakeCascadeMock.mockClear()

        const wakeResult = await service.setWakeCondition(created.thread.id, {
            createdBy: 'Analyst',
            target: 'self',
            onSatisfiedMessage: 'Read review-summary and hand off your answer.',
            condition: { type: 'board_key_exists', key: 'review-summary' },
        })
        expect(wakeResult.ok).toBe(true)

        await vi.waitFor(() => {
            expect(processWakeTargetsMock).toHaveBeenCalledTimes(1)
        })
        expect(processWakeTargetsMock).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    participantKey: 'Analyst',
                    reason: 'wake-condition',
                    wakeCondition: expect.objectContaining({
                        onSatisfiedMessage: 'Read review-summary and hand off your answer.',
                        status: 'triggered',
                    }),
                }),
            ],
            teamDefinition,
            expect.anything(),
            expect.anything(),
            created.thread.id,
            workingDir,
        )
    })

    it('replaces older wait conditions for the same participant with the latest one', async () => {
        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)
        const created = await service.createThread(teamDefinition.id, teamDefinition)
        expect(created.ok).toBe(true)

        const first = await service.setWakeCondition(created.thread.id, {
            createdBy: 'Analyst',
            target: 'self',
            onSatisfiedMessage: 'Resume when Head replies.',
            condition: { type: 'message_received', from: 'Head' },
        })
        expect(first.ok).toBe(true)

        const second = await service.setWakeCondition(created.thread.id, {
            createdBy: 'Analyst',
            target: 'self',
            onSatisfiedMessage: 'Resume when review-summary exists.',
            condition: { type: 'board_key_exists', key: 'review-summary' },
        })
        expect(second.ok).toBe(true)

        const runtime = (service as unknown as {
            threadManager: { getThreadRuntime(threadId: string): { mailbox: { getState(): { wakeConditions: WakeCondition[] } } } | null }
        }).threadManager.getThreadRuntime(created.thread.id)
        expect(runtime).toBeTruthy()
        const wakeConditions = runtime?.mailbox.getState().wakeConditions || []
        expect(wakeConditions).toHaveLength(1)
        expect(wakeConditions[0]).toEqual(expect.objectContaining({
            createdBy: 'Analyst',
            onSatisfiedMessage: 'Resume when review-summary exists.',
            condition: { type: 'board_key_exists', key: 'review-summary' },
            status: 'waiting',
        }))
    })

    it('lists board entries by kind and fetches exact keys separately', async () => {
        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)
        const created = await service.createThread(teamDefinition.id, teamDefinition)
        expect(created.ok).toBe(true)

        const artifactContent = 'A'.repeat(320)
        await service.postToBoard(created.thread.id, {
            author: 'Head',
            key: 'review-summary',
            kind: 'artifact',
            content: artifactContent,
        })
        await service.postToBoard(created.thread.id, {
            author: 'Analyst',
            key: 'risk-list',
            kind: 'finding',
            content: 'One open question remains.',
        })

        const listed = await service.listBoard(created.thread.id, { kind: 'artifact', summaryOnly: true })
        expect(listed.ok).toBe(true)
        if (!listed.ok) return
        expect(listed.entries).toHaveLength(1)
        expect(listed.entries[0]?.key).toBe('review-summary')
        expect(listed.entries[0]?.content.endsWith('…')).toBe(true)

        const exact = await service.getBoardEntry(created.thread.id, 'review-summary')
        expect(exact.ok).toBe(true)
        if (!exact.ok) return
        expect(exact.entry.key).toBe('review-summary')
        expect(exact.entry.content).toBe(artifactContent)

        const missing = await service.getBoardEntry(created.thread.id, 'missing-key')
        expect(missing).toEqual({
            ok: false,
            status: 404,
            error: 'Shared note "missing-key" not found',
        })
    })

    it('self-wakes wake_at waits without needing another runtime event', async () => {
        vi.useFakeTimers()

        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)
        const created = await service.createThread(teamDefinition.id, teamDefinition)
        expect(created.ok).toBe(true)

        const wakeResult = await service.setWakeCondition(created.thread.id, {
            createdBy: 'Analyst',
            target: 'self',
            onSatisfiedMessage: 'Resume after the scheduled wake and continue.',
            condition: { type: 'wake_at', at: Date.now() + 1_000 },
        })
        expect(wakeResult.ok).toBe(true)
        expect(processWakeTargetsMock).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1_000)
        await vi.waitFor(() => {
            expect(processWakeTargetsMock).toHaveBeenCalledTimes(1)
        })
        expect(processWakeTargetsMock).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    participantKey: 'Analyst',
                    reason: 'wake-condition',
                    wakeCondition: expect.objectContaining({
                        onSatisfiedMessage: 'Resume after the scheduled wake and continue.',
                        status: 'triggered',
                    }),
                }),
            ],
            teamDefinition,
            expect.anything(),
            expect.anything(),
            created.thread.id,
            workingDir,
        )
    })

    it('rejects unsupported wait condition types instead of storing silent fallbacks', async () => {
        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)
        const created = await service.createThread(teamDefinition.id, teamDefinition)
        expect(created.ok).toBe(true)

        const result = await service.setWakeCondition(created.thread.id, {
            createdBy: 'Analyst',
            target: 'self',
            onSatisfiedMessage: 'Resume later.',
            condition: { type: 'timeout', at: Date.now() + 1_000 } as never,
        })

        expect(result).toEqual({
            ok: false,
            status: 400,
            error: 'condition.type "timeout" is not supported',
        })
    })

    it('replays blocked participant wakes from persisted retry state on load', async () => {
        const { workspaceIdForDir, workspaceDir } = await import('../../lib/config.js')
        const workspaceId = workspaceIdForDir(workingDir)
        const threadId = 'thread-recover'
        const threadDir = path.join(workspaceDir(workspaceId), 'team-runtime', teamDefinition.id, threadId)
        const pendingTimestamp = Date.now()

        await fs.mkdir(threadDir, { recursive: true })
        await fs.writeFile(path.join(threadDir, 'thread.json'), JSON.stringify({
            schemaVersion: 2,
            thread: {
                id: threadId,
                teamId: teamDefinition.id,
                mailbox: {
                    pendingMessages: [{
                        id: 'mail-1',
                        from: 'Head',
                        to: 'Analyst',
                        content: 'Resume this analysis after restart.',
                        tag: 'handoff',
                        timestamp: pendingTimestamp,
                        status: 'pending',
                    }],
                    board: {},
                    wakeConditions: [],
                },
                participantSessions: {
                    Analyst: 'session-analyst',
                },
                participantStatuses: {
                    Analyst: {
                        type: 'retry',
                        updatedAt: pendingTimestamp + 1,
                        message: 'Waiting for the current workspace run to finish before applying projection changes.',
                    },
                },
                retiredParticipantSessions: {},
                createdAt: pendingTimestamp,
                status: 'active',
            },
            teamDefinition,
        }, null, 2), 'utf-8')
        await fs.writeFile(path.join(threadDir, 'board.json'), JSON.stringify([], null, 2), 'utf-8')
        await fs.writeFile(path.join(threadDir, 'events.jsonl'), `${JSON.stringify({
            id: 'evt-1',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'Head',
            timestamp: pendingTimestamp,
            payload: {
                from: 'Head',
                to: 'Analyst',
                tag: 'handoff',
                threadId,
            },
        })}\n`, 'utf-8')

        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)

        const listed = await service.listThreads(teamDefinition.id)
        expect(listed.ok).toBe(true)

        expect(processWakeTargetsMock).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    participantKey: 'Analyst',
                    reason: 'subscription',
                    triggerEvent: expect.objectContaining({
                        type: 'message.sent',
                        source: 'Head',
                    }),
                }),
            ],
            teamDefinition,
            expect.anything(),
            expect.anything(),
            threadId,
            workingDir,
        )
    })

    it('reconciles stale persisted busy participant statuses against current session status on load', async () => {
        const { workspaceIdForDir, workspaceDir } = await import('../../lib/config.js')
        const workspaceId = workspaceIdForDir(workingDir)
        const threadId = 'thread-stale-busy'
        const sessionId = 'session-head'
        const threadDir = path.join(workspaceDir(workspaceId), 'team-runtime', teamDefinition.id, threadId)

        await fs.mkdir(threadDir, { recursive: true })
        await fs.writeFile(path.join(threadDir, 'thread.json'), JSON.stringify({
            schemaVersion: 2,
            thread: {
                id: threadId,
                teamId: teamDefinition.id,
                mailbox: {
                    pendingMessages: [],
                    board: {},
                    wakeConditions: [],
                },
                participantSessions: {
                    Head: sessionId,
                },
                participantStatuses: {
                    Head: {
                        type: 'busy',
                        updatedAt: Date.now(),
                    },
                },
                retiredParticipantSessions: {},
                createdAt: Date.now(),
                status: 'active',
            },
            teamDefinition,
        }, null, 2), 'utf-8')
        await fs.writeFile(path.join(threadDir, 'board.json'), JSON.stringify([], null, 2), 'utf-8')
        await fs.writeFile(path.join(threadDir, 'events.jsonl'), '', 'utf-8')

        sessionStatusMock.mockResolvedValueOnce({
            data: {
                [sessionId]: { type: 'idle' },
            },
        })

        const { getTeamRuntimeService } = await import('./team-runtime-service.js')
        const service = getTeamRuntimeService(workingDir)
        const listed = await service.listThreads(teamDefinition.id)

        expect(listed.ok).toBe(true)
        if (!listed.ok) return
        expect(listed.threads[0]?.participantStatuses?.Head?.type).toBe('idle')

        const persisted = JSON.parse(await fs.readFile(path.join(threadDir, 'thread.json'), 'utf-8'))
        expect(persisted.thread.participantStatuses.Head.type).toBe('idle')
    })
})
