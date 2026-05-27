import { describe, expect, it } from 'vitest'
import { getSkillSlashMatch } from './performer-chat-slash'

describe('getSkillSlashMatch', () => {
    it('opens Skill selection for a bare slash', () => {
        expect(getSkillSlashMatch('/', null)).toBe('')
    })

    it('uses text after the slash as a Skill query', () => {
        expect(getSkillSlashMatch('/reviewer', null)).toBe('reviewer')
    })

    it('keeps the explicit Skill command working', () => {
        expect(getSkillSlashMatch('/skill reviewer', '/skill')).toBe('reviewer')
    })

    it('treats dance as an ordinary Skill query', () => {
        expect(getSkillSlashMatch('/dance reviewer', '/dance')).toBe('dance reviewer')
    })

    it('does not steal undo and redo commands', () => {
        expect(getSkillSlashMatch('/undo', null)).toBeNull()
        expect(getSkillSlashMatch('/redo', null)).toBeNull()
    })
})
