import { describe, expect, it } from 'vitest'
import { normalizeChatSessionMessages } from './chat-session-message.js'

describe('chat session message normalization', () => {
    it('keeps only the Studio-supported session message fields', () => {
        expect(normalizeChatSessionMessages([
            {
                id: 'message-1',
                role: 'assistant',
                unknown: 'drop-me',
                model: {
                    providerID: 'openai',
                    modelID: 'gpt-5',
                    unknown: 'drop-me',
                },
                info: {
                    id: 'info-1',
                    role: 'assistant',
                    time: { created: 1, completed: 2 },
                    error: {
                        data: { message: 'Nope', isRetryable: false, extra: true },
                        message: 'Nope',
                    },
                },
                parts: [
                    { id: 'part-1', type: 'text', text: 'Hello', extra: 'drop-me' },
                    {
                        id: 'tool-1',
                        type: 'tool',
                        tool: { name: 'edit', unknown: 'drop-me' },
                        callID: 'call-1',
                        state: {
                            status: 'completed',
                            input: { path: 'src/file.ts' },
                            metadata: { ok: true },
                            output: 'done',
                            time: { start: 10, end: 20 },
                            extra: 'drop-me',
                        },
                    },
                    { id: 'ignored', type: 'unknown', text: 'drop-me' },
                ],
            },
        ])).toEqual([
            {
                id: 'message-1',
                role: 'assistant',
                createdAt: 1,
                completedAt: 2,
                model: {
                    providerId: 'openai',
                    modelId: 'gpt-5',
                },
                error: {
                    data: { message: 'Nope', isRetryable: false },
                    message: 'Nope',
                },
                parts: [
                    { id: 'part-1', type: 'text', text: 'Hello' },
                    {
                        id: 'tool-1',
                        type: 'tool',
                        tool: 'edit',
                        callId: 'call-1',
                        state: {
                            status: 'completed',
                            input: { path: 'src/file.ts' },
                            metadata: { ok: true },
                            output: 'done',
                            time: { start: 10, end: 20 },
                        },
                    },
                ],
            },
        ])
    })

    it('does not accept model id aliases outside the OpenCode raw message boundary shape', () => {
        expect(normalizeChatSessionMessages([
            {
                id: 'message-1',
                role: 'assistant',
                model: {
                    providerId: 'openai',
                    modelId: 'gpt-5',
                    provider: 'anthropic',
                    id: 'claude-sonnet-4',
                },
                parts: [{ id: 'text-1', type: 'text', text: 'Hello' }],
            },
        ])).toEqual([
            {
                id: 'message-1',
                role: 'assistant',
                parts: [{ id: 'text-1', type: 'text', text: 'Hello' }],
            },
        ])
    })

    it('drops raw tool parts without a real call id', () => {
        expect(normalizeChatSessionMessages([
            {
                id: 'message-1',
                role: 'assistant',
                parts: [
                    { id: 'tool-1', type: 'tool', tool: 'edit', state: { status: 'completed' } },
                    { id: 'text-1', type: 'text', text: 'Done' },
                ],
            },
        ])).toEqual([
            {
                id: 'message-1',
                role: 'assistant',
                parts: [{ id: 'text-1', type: 'text', text: 'Done' }],
            },
        ])
    })

    it('promotes raw info metadata into the Studio message metadata locations', () => {
        expect(normalizeChatSessionMessages([
            {
                id: 'message-1',
                role: 'assistant',
                model: {
                    providerID: 'openai',
                    modelID: 'gpt-5',
                },
                info: {
                    id: 'info-1',
                    role: 'assistant',
                    agent: 'build',
                    variant: 'high',
                },
                parts: [{ id: 'text-1', type: 'text', text: 'Hello' }],
            },
        ])).toEqual([
            {
                id: 'message-1',
                role: 'assistant',
                agent: 'build',
                model: {
                    providerId: 'openai',
                    modelId: 'gpt-5',
                    variant: 'high',
                },
                parts: [{ id: 'text-1', type: 'text', text: 'Hello' }],
            },
        ])
    })
})
