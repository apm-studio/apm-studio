import type { PermissionRequest } from '@opencode-ai/sdk/v2'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDiscordBackfillMessages, listStandaloneThreadsForDiscord, waitForAssistantReply } from './studio-runtime.js'

const chatSessionMocks = vi.hoisted(() => ({
    status: vi.fn(),
    messages: vi.fn(),
    permissions: vi.fn(),
    questions: vi.fn(),
    sessions: vi.fn(),
    respondPermission: vi.fn(),
    respondQuestion: vi.fn(),
    rejectQuestion: vi.fn(),
}))

const ownershipMocks = vi.hoisted(() => ({
    list: vi.fn(),
}))

vi.mock('../chat-session-service.js', () => ({
    getStudioChatSessionStatus: chatSessionMocks.status,
    listStudioChatSessions: chatSessionMocks.sessions,
    listPendingPermissions: chatSessionMocks.permissions,
    listPendingQuestions: chatSessionMocks.questions,
    listStudioSessionMessages: chatSessionMocks.messages,
    rejectQuestion: chatSessionMocks.rejectQuestion,
    respondQuestion: chatSessionMocks.respondQuestion,
    respondSessionPermission: chatSessionMocks.respondPermission,
}))

vi.mock('../session-ownership-service.js', () => ({
    listSessionOwnershipsForWorkingDir: ownershipMocks.list,
}))

beforeEach(() => {
    vi.clearAllMocks()
    chatSessionMocks.permissions.mockResolvedValue([])
    chatSessionMocks.questions.mockResolvedValue([])
    chatSessionMocks.messages.mockResolvedValue({ messages: [], nextCursor: null })
    chatSessionMocks.status.mockResolvedValue({ status: { type: 'idle' } })
    chatSessionMocks.sessions.mockResolvedValue([])
    ownershipMocks.list.mockResolvedValue([])
})

afterEach(() => {
    vi.useRealTimers()
})

describe('formatDiscordBackfillMessages', () => {
    it('keeps recent text-only user and assistant messages with role labels', () => {
        const messages = formatDiscordBackfillMessages({
            sessionId: 'session-1',
            assistantLabel: 'Planner',
            limit: 2,
            messages: [
                { id: 'system-1', role: 'system', content: 'hidden' },
                { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Plan this.' }] },
                { id: 'tool-1', role: 'assistant', parts: [{ type: 'tool', text: 'raw tool output' }] },
                { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Here is a plan.' }] },
                { id: 'user-2', info: { role: 'user' }, content: 'Revise it.' },
            ],
        })

        expect(messages).toEqual([
            { id: 'session-1:assistant-1', content: '**[Planner]**\nHere is a plan.' },
            { id: 'session-1:user-2', content: '**[Studio User]**\nRevise it.' },
        ])
    })

    it('skips already backfilled message ids', () => {
        const messages = formatDiscordBackfillMessages({
            sessionId: 'session-1',
            assistantLabel: 'Planner',
            knownMessageIds: ['session-1:user-1'],
            messages: [
                { id: 'user-1', role: 'user', content: 'Already sent.' },
                { id: 'assistant-1', role: 'assistant', content: 'New response.' },
            ],
        })

        expect(messages).toEqual([
            { id: 'session-1:assistant-1', content: '**[Planner]**\nNew response.' },
        ])
    })

    it('can hide user messages for Act participant history sync', () => {
        const messages = formatDiscordBackfillMessages({
            sessionId: 'session-1',
            assistantLabel: 'Reviewer',
            includeUserMessages: false,
            messages: [
                { id: 'user-1', role: 'user', content: '[Direct Message]\nfrom teammate' },
                { id: 'assistant-1', role: 'assistant', content: 'I reviewed the draft.' },
            ],
        })

        expect(messages).toEqual([
            { id: 'session-1:assistant-1', content: '**[Reviewer]**\nI reviewed the draft.' },
        ])
    })
})

describe('listStandaloneThreadsForDiscord', () => {
    it('does not expose orphan ownership records as saved performer threads', async () => {
        ownershipMocks.list.mockResolvedValue([
            {
                sessionId: 'session-live',
                ownerKind: 'performer',
                ownerId: 'performer-1',
                workingDir: '/tmp/workspace',
                sidebarTitle: 'Live thread',
                updatedAt: 20,
            },
            {
                sessionId: 'session-orphan',
                ownerKind: 'performer',
                ownerId: 'performer-1',
                workingDir: '/tmp/workspace',
                sidebarTitle: 'Orphan thread',
                updatedAt: 30,
            },
        ])
        chatSessionMocks.sessions.mockResolvedValue([
            {
                id: 'session-live',
                title: 'Live session',
                updatedAt: 10,
            },
        ])

        await expect(listStandaloneThreadsForDiscord('/tmp/workspace', 'performer-1')).resolves.toEqual([
            {
                id: 'session-live',
                name: 'Live thread',
                updatedAt: 10,
            },
        ])
    })

    it('uses numbered default names instead of Studio metadata titles', async () => {
        ownershipMocks.list.mockResolvedValue([
            {
                sessionId: 'session-older',
                ownerKind: 'performer',
                ownerId: 'performer-1',
                workingDir: '/tmp/workspace',
                updatedAt: 10,
            },
            {
                sessionId: 'session-newer',
                ownerKind: 'performer',
                ownerId: 'performer-1',
                workingDir: '/tmp/workspace',
                updatedAt: 20,
            },
        ])
        chatSessionMocks.sessions.mockResolvedValue([
            {
                id: 'session-older',
                title: 'DOT Studio: Planner [studio:performer-1:hash-a]',
                createdAt: 100,
                updatedAt: 10,
            },
            {
                id: 'session-newer',
                title: 'DOT Studio: Planner [studio:performer-1:hash-b]',
                createdAt: 200,
                updatedAt: 20,
            },
        ])

        await expect(listStandaloneThreadsForDiscord('/tmp/workspace', 'performer-1')).resolves.toEqual([
            {
                id: 'session-newer',
                name: 'New thread (2)',
                createdAt: 200,
                updatedAt: 20,
            },
            {
                id: 'session-older',
                name: 'New thread (1)',
                createdAt: 100,
                updatedAt: 10,
            },
        ])
    })
})

describe('waitForAssistantReply', () => {
    it('keeps polling through a short idle gap so delayed permissions become Discord prompts', async () => {
        vi.useFakeTimers()
        const permission = {
            id: 'permission-1',
            sessionID: 'session-1',
            permission: 'tool.execute',
        } as PermissionRequest
        chatSessionMocks.permissions
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([permission])
        chatSessionMocks.status
            .mockResolvedValueOnce({ status: { type: 'busy' } })
            .mockResolvedValueOnce({ status: { type: 'idle' } })

        const reply = waitForAssistantReply('/tmp/workspace', 'session-1')
        await vi.advanceTimersByTimeAsync(1_000)
        await vi.advanceTimersByTimeAsync(1_000)

        await expect(reply).resolves.toEqual({
            kind: 'permission',
            request: permission,
        })
    })
})
