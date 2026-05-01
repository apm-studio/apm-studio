import { describe, expect, it } from 'vitest'
import { getDanceSlashMatch } from './performer-chat-slash'

describe('getDanceSlashMatch', () => {
    it('opens dance selection for a bare slash', () => {
        expect(getDanceSlashMatch('/', null)).toBe('')
    })

    it('uses text after the slash as a dance query', () => {
        expect(getDanceSlashMatch('/reviewer', null)).toBe('reviewer')
    })

    it('keeps the explicit dance command working', () => {
        expect(getDanceSlashMatch('/dance reviewer', '/dance')).toBe('reviewer')
    })

    it('does not steal undo and redo commands', () => {
        expect(getDanceSlashMatch('/undo', null)).toBeNull()
        expect(getDanceSlashMatch('/redo', null)).toBeNull()
    })
})
