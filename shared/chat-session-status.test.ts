import { describe, expect, it } from 'vitest'
import { normalizeChatSessionStatus, normalizeChatSessionStatusMap } from './chat-session-status.js'

describe('chat session status normalization', () => {
    it('keeps only Studio-supported session status fields', () => {
        expect(normalizeChatSessionStatus({
            type: 'busy',
            message: 'Still running',
            unknown: 'drop-me',
        })).toEqual({
            type: 'busy',
            message: 'Still running',
        })
    })

    it('drops unknown status types and malformed map entries', () => {
        expect(normalizeChatSessionStatusMap({
            'session-1': { type: 'idle' },
            'session-2': { type: 'paused' },
            'session-3': null,
        })).toEqual({
            'session-1': { type: 'idle' },
        })
    })
})
