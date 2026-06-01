import { describe, expect, it } from 'vitest'
import type { ChatSendRequest } from '../../../shared/chat-contracts.js'
import type { ModelCapabilities } from '../../../shared/model-types.js'
import { buildChatPromptParts } from './chat-prompt-parts.js'

const attachmentCapableModel: ModelCapabilities = {
    toolCall: true,
    reasoning: false,
    attachment: true,
    temperature: true,
    modalities: {
        input: ['text', 'image'],
        output: ['text'],
    },
}

function chatRequest(overrides: Partial<ChatSendRequest> = {}): ChatSendRequest {
    return {
        message: 'Review this file.',
        agent: {
            agentId: 'agent-1',
            agentName: 'Agent',
            skillRefs: [],
            model: {
                provider: 'openai',
                modelId: 'gpt-5',
            },
        },
        ...overrides,
    }
}

describe('buildChatPromptParts', () => {
    it('keeps user text and supported file attachments in one prompt parts list', () => {
        expect(buildChatPromptParts(
            chatRequest({
                attachments: [{
                    type: 'file',
                    mime: 'text/plain',
                    url: 'file:///tmp/notes.txt',
                    filename: 'notes.txt',
                }],
            }),
            attachmentCapableModel,
        )).toEqual([
            {
                type: 'text',
                text: 'Review this file.',
            },
            {
                type: 'file',
                mime: 'text/plain',
                url: 'file:///tmp/notes.txt',
                filename: 'notes.txt',
            },
        ])
    })

    it('blocks attachments when the selected model capability snapshot disallows them', () => {
        expect(() => buildChatPromptParts(
            chatRequest({
                attachments: [{
                    type: 'file',
                    mime: 'text/plain',
                    url: 'file:///tmp/notes.txt',
                }],
            }),
            {
                ...attachmentCapableModel,
                attachment: false,
            },
        )).toThrow('Selected model does not support attachments')
    })
})
