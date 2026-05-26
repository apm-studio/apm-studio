import { describe, expect, it } from 'vitest'
import { getSlashMenuQuery, resolveSelectedSlashCommand } from './useSlashCommands'

describe('useSlashCommands helpers', () => {
    it('keeps the slash menu open while the user is typing a command token', () => {
        expect(getSlashMenuQuery('/sk')).toBe('/sk')
    })

    it('closes the slash menu once the user types a space after a slash token', () => {
        expect(getSlashMenuQuery('/da hello')).toBeNull()
    })

    it('preserves an explicitly selected slash command while editing its argument text', () => {
        expect(resolveSelectedSlashCommand('/skill hello', '/skill')).toBe('/skill')
    })

    it('clears the selected slash command once the command token no longer matches', () => {
        expect(resolveSelectedSlashCommand('/danger hello', '/skill')).toBeNull()
    })
})
