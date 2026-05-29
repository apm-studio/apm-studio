import { describe, expect, it } from 'vitest'

import {
    ASSISTANT_MUTATION_TOOL_NAME,
    getAssistantMessageActionCalls,
    getPendingAssistantToolMessages,
    parseAssistantActionEnvelope,
    lintAssistantActionEnvelope,
} from './assistant-protocol'

describe('assistant-protocol', () => {
    it('parses a valid tool input envelope', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [{ type: 'createTeam', name: 'Review Flow' }],
        })

        expect(envelope?.actions).toHaveLength(1)
    })

    it('parses Studio UI operation actions', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [
                { type: 'showAgent', agentName: 'Writer', surface: 'editor' },
                { type: 'showTeam', teamName: 'Review Flow', surface: 'editor', editorMode: 'team' },
                { type: 'showDraft', draftName: 'Review Instruction', kind: 'instruction' },
                { type: 'setStudioPanel', panel: 'packages', open: true },
                {
                    type: 'setStudioNodeFrame',
                    nodeType: 'agent',
                    agentName: 'Writer',
                    position: { x: 120, y: 80 },
                    size: { width: 420, height: 520 },
                },
            ],
        })

        expect(envelope?.actions).toHaveLength(5)
        expect(envelope?.actions[0]).toMatchObject({ type: 'showAgent', surface: 'editor' })
        expect(lintAssistantActionEnvelope(envelope!)).toEqual([])
    })

    it('rejects invalid action payloads from tool input', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [{ type: 'updateAgent', model: { provider: 'openai', modelId: 'gpt-4.1' } }],
        })

        expect(envelope).toBeNull()
    })

    it('parses a valid tool input envelope from JSON text', () => {
        const envelope = parseAssistantActionEnvelope(JSON.stringify({
            version: 1,
            actions: [{ type: 'createAgent', ref: 'writer', name: 'Writer' }],
        }))

        expect(envelope?.actions).toHaveLength(1)
        expect(envelope?.actions[0]).toMatchObject({ type: 'createAgent', name: 'Writer' })
    })

    it('normalizes empty agent Instruction placeholders before linting', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [{
                type: 'createAgent',
                ref: 'brand',
                name: 'Brand Strategist',
                model: { provider: 'openai', modelId: 'gpt-5.3-codex' },
                instructionUrn: null,
                instructionDraftId: '',
                instructionDraftRef: '',
                instructionDraft: {
                    ref: '',
                    name: '',
                    content: '',
                    slug: '',
                    description: '',
                    tags: [],
                    openEditor: false,
                },
            }],
        })

        expect(envelope).not.toBeNull()
        expect(envelope?.actions[0]).toMatchObject({
            type: 'createAgent',
            ref: 'brand',
            name: 'Brand Strategist',
            model: { provider: 'openai', modelId: 'gpt-5.3-codex' },
        })
        expect((envelope?.actions[0] as { instructionDraft?: unknown }).instructionDraft).toBeUndefined()
        expect((envelope?.actions[0] as { instructionDraftId?: unknown }).instructionDraftId).toBeUndefined()
        expect((envelope?.actions[0] as { instructionDraftRef?: unknown }).instructionDraftRef).toBeUndefined()
        expect(lintAssistantActionEnvelope(envelope!)).toEqual([])
    })

    it('drops unknown action fields at the assistant action boundary', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [
                {
                    type: 'createAgent',
                    ref: 'writer',
                    name: 'Writer',
                    model: { provider: 'openai', modelId: 'gpt-5', extra: 'drop-me' },
                    instructionDraft: {
                        ref: 'writer-instruction',
                        name: 'Writer Instruction',
                        content: '# Role',
                        extra: 'drop-me',
                    },
                    unknownTopLevel: true,
                },
                {
                    type: 'createTeam',
                    ref: 'flow',
                    name: 'Flow',
                    participantAgentRefs: ['writer'],
                    relations: [{
                        sourceAgentRef: 'writer',
                        targetAgentName: 'Reviewer',
                        direction: 'one-way',
                        name: 'handoff',
                        description: 'Send draft.',
                        ignored: true,
                    }],
                    ignored: true,
                },
                {
                    type: 'updateParticipantSubscriptions',
                    teamRef: 'flow',
                    agentRef: 'writer',
                    subscriptions: {
                        messagesFromAgentRefs: ['writer'],
                        messageTags: ['handoff'],
                        ignored: true,
                    },
                    ignored: true,
                },
            ],
        })

        expect(envelope?.actions).toEqual([
            {
                type: 'createAgent',
                ref: 'writer',
                name: 'Writer',
                model: { provider: 'openai', modelId: 'gpt-5' },
                instructionDraft: {
                    ref: 'writer-instruction',
                    name: 'Writer Instruction',
                    content: '# Role',
                },
            },
            {
                type: 'createTeam',
                ref: 'flow',
                name: 'Flow',
                participantAgentRefs: ['writer'],
                relations: [{
                    sourceAgentRef: 'writer',
                    targetAgentName: 'Reviewer',
                    direction: 'one-way',
                    name: 'handoff',
                    description: 'Send draft.',
                }],
            },
            {
                type: 'updateParticipantSubscriptions',
                teamRef: 'flow',
                agentRef: 'writer',
                subscriptions: {
                    messagesFromAgentRefs: ['writer'],
                    messageTags: ['handoff'],
                },
            },
        ])
    })

    it('extracts completed assistant mutation tool calls in order', () => {
        const calls = getAssistantMessageActionCalls({
            parts: [
                {
                    id: 'tool-1',
                    type: 'tool',
                    tool: {
                        name: ASSISTANT_MUTATION_TOOL_NAME,
                        callId: 'call-1',
                        status: 'completed',
                        input: {
                            version: 1,
                            actions: [{ type: 'createAgent', ref: 'writer', name: 'Writer' }],
                        },
                    },
                },
                {
                    id: 'tool-2',
                    type: 'tool',
                    tool: {
                        name: ASSISTANT_MUTATION_TOOL_NAME,
                        callId: 'call-2',
                        status: 'completed',
                        input: {
                            version: 1,
                            actions: [{ type: 'createTeam', name: 'Review Flow', participantAgentNames: ['Writer'] }],
                        },
                    },
                },
            ],
        })

        expect(calls).toHaveLength(2)
        expect(calls[0].callId).toBe('call-1')
        expect(calls[0].actions[0]).toMatchObject({ type: 'createAgent', name: 'Writer' })
        expect(calls[1].callId).toBe('call-2')
        expect(calls[1].actions[0]).toMatchObject({ type: 'createTeam', name: 'Review Flow' })
    })

    it('ignores non-completed or non-assistant tool parts', () => {
        const calls = getAssistantMessageActionCalls({
            parts: [
                {
                    id: 'tool-1',
                    type: 'tool',
                    tool: {
                        name: ASSISTANT_MUTATION_TOOL_NAME,
                        callId: 'call-1',
                        status: 'running',
                        input: {
                            version: 1,
                            actions: [{ type: 'createAgent', name: 'Writer' }],
                        },
                    },
                },
                {
                    id: 'tool-2',
                    type: 'tool',
                    tool: {
                        name: 'read_file',
                        callId: 'call-2',
                        status: 'completed',
                    },
                },
            ],
        })

        expect(calls).toEqual([])
    })

    it('accepts assistant mutation tool calls identified by metadata and string input', () => {
        const calls = getAssistantMessageActionCalls({
            parts: [
                {
                    id: 'tool-1',
                    type: 'tool',
                    tool: {
                        name: 'unknown',
                        callId: 'call-1',
                        status: 'completed',
                        metadata: {
                            studioAssistantMutation: true,
                        },
                        input: JSON.stringify({
                            version: 1,
                            actions: [{ type: 'createTeam', name: 'Review Flow' }],
                        }) as unknown as Record<string, unknown>,
                    },
                },
            ],
        })

        expect(calls).toHaveLength(1)
        expect(calls[0].actions[0]).toMatchObject({ type: 'createTeam', name: 'Review Flow' })
    })

    it('collects unapplied assistant tool messages without waiting for session idle', () => {
        const pending = getPendingAssistantToolMessages([
            {
                id: 'msg-1',
                role: 'assistant',
                parts: [
                    {
                        id: 'tool-1',
                        type: 'tool',
                        tool: {
                            name: ASSISTANT_MUTATION_TOOL_NAME,
                            callId: 'call-1',
                            status: 'completed',
                            input: {
                                version: 1,
                                actions: [{ type: 'createAgent', name: 'Writer' }],
                            },
                        },
                    },
                ],
            },
            {
                id: 'msg-2',
                role: 'assistant',
                parts: [],
            },
            {
                id: 'msg-3',
                role: 'user',
                parts: [
                    {
                        id: 'tool-2',
                        type: 'tool',
                        tool: {
                            name: ASSISTANT_MUTATION_TOOL_NAME,
                            callId: 'call-2',
                            status: 'completed',
                            input: {
                                version: 1,
                                actions: [{ type: 'createTeam', name: 'Review Flow' }],
                            },
                        },
                    },
                ],
            },
        ], {})

        expect(pending).toHaveLength(1)
        expect(pending[0]).toMatchObject({
            messageId: 'msg-1',
        })
        expect(pending[0].actionCalls[0].actions[0]).toMatchObject({ type: 'createAgent', name: 'Writer' })
    })

    it('skips assistant messages that were already applied', () => {
        const pending = getPendingAssistantToolMessages([
            {
                id: 'msg-1',
                role: 'assistant',
                parts: [
                    {
                        id: 'tool-1',
                        type: 'tool',
                        tool: {
                            name: ASSISTANT_MUTATION_TOOL_NAME,
                            callId: 'call-1',
                            status: 'completed',
                            input: {
                                version: 1,
                                actions: [{ type: 'createAgent', name: 'Writer' }],
                            },
                        },
                    },
                ],
            },
        ], { 'msg-1': true })

        expect(pending).toEqual([])
    })

    it('flags invalid same-call refs as lint errors', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [
                { type: 'createTeam', name: 'Review Flow', participantAgentRefs: ['writer', 'reviewer'] },
                { type: 'createAgent', ref: 'writer', name: 'Writer' },
                { type: 'createAgent', ref: 'reviewer', name: 'Reviewer' },
            ],
        })

        expect(envelope).not.toBeNull()
        expect(lintAssistantActionEnvelope(envelope!)).toEqual([
            {
                level: 'warning',
                actionIndex: 0,
                message: 'createTeam has multiple participants but no relations. This often produces a disconnected workflow.',
            },
            {
                level: 'error',
                actionIndex: 0,
                message: 'agent ref "writer" is used before it is created in the same tool call.',
            },
            {
                level: 'error',
                actionIndex: 0,
                message: 'agent ref "reviewer" is used before it is created in the same tool call.',
            },
        ])
    })

    it('lints UI operation same-call refs', () => {
        const envelope = parseAssistantActionEnvelope({
            version: 1,
            actions: [
                { type: 'showAgent', agentRef: 'writer' },
                { type: 'setStudioNodeFrame', nodeType: 'team', teamRef: 'flow', position: { x: 0, y: 0 } },
            ],
        })

        expect(envelope).not.toBeNull()
        expect(lintAssistantActionEnvelope(envelope!)).toEqual([
            {
                level: 'error',
                actionIndex: 0,
                message: 'agent ref "writer" is used before it is created in the same tool call.',
            },
            {
                level: 'error',
                actionIndex: 1,
                message: 'team ref "flow" is used before it is created in the same tool call.',
            },
        ])
    })
})
