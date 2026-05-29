import { describe, expect, it } from 'vitest'
import {
    TEAM_DEFAULT_EXPANDED_HEIGHT,
    TEAM_MIN_EXPANDED_HEIGHT,
    resolveTeamExpandedHeight,
} from './team-layout'

describe('resolveTeamExpandedHeight', () => {
    it('falls back to the default expanded height when missing', () => {
        expect(resolveTeamExpandedHeight(undefined)).toBe(TEAM_DEFAULT_EXPANDED_HEIGHT)
    })

    it('normalizes short team heights to the minimum usable height', () => {
        expect(resolveTeamExpandedHeight(80)).toBe(TEAM_MIN_EXPANDED_HEIGHT)
        expect(resolveTeamExpandedHeight(320)).toBe(TEAM_MIN_EXPANDED_HEIGHT)
    })

    it('preserves larger custom heights', () => {
        expect(resolveTeamExpandedHeight(540)).toBe(540)
    })
})
