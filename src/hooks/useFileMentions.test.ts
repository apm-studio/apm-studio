import { describe, expect, it } from 'vitest'
import { parseFileMention } from './useFileMentions'

describe('parseFileMention', () => {
    it('matches compact file mentions', () => {
        expect(parseFileMention('read #src/App.tsx', 'read #src/App.tsx'.length)).toEqual({
            query: 'src/App.tsx',
            startIndex: 5,
        })
    })

    it('matches file mentions with a space after the hash', () => {
        expect(parseFileMention('read # src/App.tsx', 'read # src/App.tsx'.length)).toEqual({
            query: 'src/App.tsx',
            startIndex: 5,
        })
    })

    it('keeps spaces inside natural file search queries', () => {
        expect(parseFileMention('read # performer chat', 'read # performer chat'.length)).toEqual({
            query: 'performer chat',
            startIndex: 5,
        })
    })

    it('ignores hashes inside words', () => {
        expect(parseFileMention('issue#123', 'issue#123'.length)).toBeNull()
    })
})
