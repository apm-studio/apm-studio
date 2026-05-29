import { describe, expect, it } from 'vitest'

import {
    normalizeOpenCodeSessionSummary,
    normalizeRevertState,
    readResponseHeader,
} from './session-normalizers.js'

describe('chat session normalizers', () => {
    it('normalizes raw OpenCode session summaries into Studio summary fields', () => {
        expect(normalizeOpenCodeSessionSummary({
            id: 'session-1',
            title: 'Review',
            parentID: 'parent-1',
            time: {
                created: 10,
                updated: 20,
            },
        }, 'busy', 'Sidebar Review')).toEqual({
            id: 'session-1',
            title: 'Review',
            createdAt: 10,
            updatedAt: 20,
            parentId: 'parent-1',
            status: 'busy',
            sidebarTitle: 'Sidebar Review',
        })
    })

    it('normalizes revert state from OpenCode casing', () => {
        expect(normalizeRevertState({
            revert: {
                messageID: 'message-1',
                partID: 'part-1',
            },
        })).toEqual({
            messageId: 'message-1',
            partId: 'part-1',
        })
        expect(normalizeRevertState({ revert: { messageID: '' } })).toBeNull()
    })

    it('reads trimmed pagination headers from OpenCode responses', () => {
        expect(readResponseHeader({
            response: {
                headers: {
                    get: (name: string) => name === 'x-next-cursor' ? ' cursor-2 ' : null,
                },
            },
        }, 'x-next-cursor')).toBe('cursor-2')
        expect(readResponseHeader({}, 'x-next-cursor')).toBeNull()
    })
})
