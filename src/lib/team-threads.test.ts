import { describe, expect, it } from 'vitest'
import {
    resolveTeamThreadOrdinal,
    resolveDisplayedTeamThread,
    resolvePreferredTeamThreadId,
} from './team-threads'

const threads = [
    { id: 'thread-1', createdAt: 100 },
    { id: 'thread-2', createdAt: 200 },
    { id: 'thread-3', createdAt: 300 },
]

describe('team thread helpers', () => {
    it('keeps the active thread when it still exists', () => {
        expect(resolvePreferredTeamThreadId(threads, 'thread-2')).toBe('thread-2')
    })

    it('falls back to the newest thread when the active thread is gone', () => {
        expect(resolvePreferredTeamThreadId(threads, 'missing-thread')).toBe('thread-3')
    })

    it('resolves the displayed thread from the preferred thread id', () => {
        expect(resolveDisplayedTeamThread(threads, 'missing-thread')?.id).toBe('thread-3')
    })

    it('returns the 1-based thread ordinal when present', () => {
        expect(resolveTeamThreadOrdinal(threads, 'thread-2')).toBe(2)
        expect(resolveTeamThreadOrdinal(threads, 'missing-thread')).toBeNull()
    })
})
