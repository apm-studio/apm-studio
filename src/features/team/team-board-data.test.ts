import { describe, expect, it, vi } from 'vitest'
import {
    relativeTime,
    toActivityEvent,
    toBoardEntry,
} from './team-board-data'

describe('team-board-data', () => {
    it('normalizes raw board entries defensively', () => {
        expect(toBoardEntry(null)).toBeNull()
        expect(toBoardEntry({ key: 'missing-content' })).toBeNull()
        expect(toBoardEntry({
            key: 'api-spec',
            content: 'draft',
            kind: 'unknown',
            author: 'participant-1',
            status: 'bad',
        })).toMatchObject({
            id: 'api-spec',
            key: 'api-spec',
            kind: 'note',
            author: 'participant-1',
            content: 'draft',
            version: 1,
        })
        expect(toBoardEntry({
            id: 'entry-1',
            key: 'task-1',
            content: 'do it',
            kind: 'task',
            version: 3,
            timestamp: 123,
            pinned: true,
            status: 'in_progress',
        })).toMatchObject({
            id: 'entry-1',
            kind: 'task',
            version: 3,
            timestamp: 123,
            pinned: true,
            status: 'in_progress',
        })
    })

    it('normalizes activity events and relative timestamps', () => {
        vi.setSystemTime(new Date('2026-05-29T00:00:00.000Z'))
        expect(toActivityEvent({
            id: 'evt-1',
            type: 'board.updated',
            source: 'participant-1',
            timestamp: Date.now() - 62_000,
            payload: { key: 'api-spec' },
        }, 0)).toMatchObject({
            id: 'evt-1',
            type: 'board.updated',
            source: 'participant-1',
            payload: { key: 'api-spec' },
        })
        expect(toActivityEvent({}, 3)).toMatchObject({
            id: 'evt-3',
            type: 'unknown',
            source: 'runtime',
        })
        expect(relativeTime(Date.now() - 62_000)).toBe('1m ago')
        vi.useRealTimers()
    })
})
