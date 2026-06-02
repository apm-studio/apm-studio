import { describe, expect, it } from 'vitest'
import {
    INITIAL_CACHED_MAIN_SURFACES,
    rememberMainSurface,
    shouldRenderMainSurface,
} from './app-main-surface-state'

describe('app main surface state', () => {
    it('renders the active import or target surface even before it is cached', () => {
        expect(shouldRenderMainSurface(INITIAL_CACHED_MAIN_SURFACES, 'import', 'import')).toBe(true)
        expect(shouldRenderMainSurface(INITIAL_CACHED_MAIN_SURFACES, 'target-export', 'target-export')).toBe(true)
    })

    it('keeps visited import and target surfaces renderable after switching away', () => {
        const withTarget = rememberMainSurface(INITIAL_CACHED_MAIN_SURFACES, 'target-export')
        const withBoth = rememberMainSurface(withTarget, 'import')

        expect(shouldRenderMainSurface(withBoth, 'workspace', 'target-export')).toBe(true)
        expect(shouldRenderMainSurface(withBoth, 'workspace', 'import')).toBe(true)
    })

    it('does not cache the studio workspace surface', () => {
        const cached = rememberMainSurface(INITIAL_CACHED_MAIN_SURFACES, 'workspace')

        expect(cached).toEqual(INITIAL_CACHED_MAIN_SURFACES)
    })
})
