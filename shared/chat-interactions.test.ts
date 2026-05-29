import { describe, expect, it } from 'vitest'
import {
    normalizeChatPermissionRequest,
    normalizeChatQuestionRequest,
    normalizeChatTodos,
} from './chat-interactions.js'

describe('chat interaction normalization', () => {
    it('maps OpenCode permission requests to the Studio contract', () => {
        expect(normalizeChatPermissionRequest({
            id: 'permission-1',
            sessionID: 'session-1',
            permission: 'bash',
            patterns: ['npm test'],
            always: ['npm *'],
            metadata: { cwd: '/tmp/project' },
            tool: {
                messageID: 'message-1',
                callID: 'call-1',
            },
            extra: 'ignored',
        })).toEqual({
            id: 'permission-1',
            sessionId: 'session-1',
            permission: 'bash',
            patterns: ['npm test'],
            always: ['npm *'],
            metadata: { cwd: '/tmp/project' },
            tool: {
                messageId: 'message-1',
                callId: 'call-1',
            },
        })
    })

    it('maps OpenCode question requests to the Studio contract', () => {
        expect(normalizeChatQuestionRequest({
            id: 'question-1',
            sessionID: 'session-1',
            questions: [{
                header: 'Scope',
                question: 'Which scope?',
                options: [{ label: 'Small', description: 'Do the narrow change.' }],
                multiple: false,
                custom: true,
            }],
            tool: {
                messageID: 'message-1',
                callID: 'call-1',
            },
        })).toEqual({
            id: 'question-1',
            sessionId: 'session-1',
            questions: [{
                header: 'Scope',
                question: 'Which scope?',
                options: [{ label: 'Small', description: 'Do the narrow change.' }],
                multiple: false,
                custom: true,
            }],
            tool: {
                messageId: 'message-1',
                callId: 'call-1',
            },
        })
    })

    it('drops malformed todos instead of exporting partial task state', () => {
        expect(normalizeChatTodos([
            { content: 'Fix bug', status: 'pending', priority: 'high' },
            { content: 'Missing priority', status: 'pending' },
        ])).toEqual([
            { content: 'Fix bug', status: 'pending', priority: 'high' },
        ])
    })
})
