import { describe, expect, it } from 'vitest'
import { primitiveUrnAuthor, primitiveUrnDisplayName, primitiveUrnPath, parseStudioPrimitiveUrn } from './primitive-urn'

describe('primitive urn parsing', () => {
    it('parses canonical 4-segment urns', () => {
        expect(parseStudioPrimitiveUrn('agent/@acme/agent-presets/reviewer')).toEqual({
            kind: 'agent',
            author: '@acme',
            path: 'agent-presets/reviewer',
            name: 'reviewer',
        })
        expect(primitiveUrnDisplayName('agent/@acme/agent-presets/reviewer')).toBe('reviewer')
        expect(primitiveUrnAuthor('agent/@acme/agent-presets/reviewer')).toBe('@acme')
        expect(primitiveUrnPath('agent/@acme/agent-presets/reviewer')).toBe('agent-presets/reviewer')
    })

    it('rejects noncanonical 3-segment urns', () => {
        expect(parseStudioPrimitiveUrn('agent/@acme/reviewer')).toBeNull()
        expect(primitiveUrnAuthor('agent/@acme/reviewer')).toBeNull()
        expect(primitiveUrnPath('agent/@acme/reviewer')).toBeNull()
        expect(primitiveUrnDisplayName('agent/@acme/reviewer')).toBe('reviewer')
    })
})
