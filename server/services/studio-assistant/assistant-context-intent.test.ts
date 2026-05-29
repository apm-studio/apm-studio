import { describe, expect, it } from 'vitest'

import { inferAssistantPromptIntent, scoreByTokens } from './assistant-context-intent.js'
import { selectPromptEntries } from './assistant-context-selection.js'

describe('assistant context intent', () => {
    it('infers geometry, model, and broad-list intent from mixed user wording', () => {
        const intent = inferAssistantPromptIntent('Writer 열어줘, 모델 variant 전체 목록도 보여줘')

        expect(intent.includeGeometry).toBe(true)
        expect(intent.includeModelVariants).toBe(true)
        expect(intent.includeAll).toBe(true)
        expect(intent.tokens).toContain('writer')
        expect(intent.tokens).toContain('variant')
    })

    it('scores matching tokens after normalizing punctuation and casing', () => {
        expect(scoreByTokens('Release Notes / Writer.Agent', ['release', 'writer', 'missing'])).toBe(2)
    })

    it('selects high-scoring entries while preserving original order among selected rows', () => {
        const selection = selectPromptEntries([
            { id: 'a', text: 'alpha' },
            { id: 'b', text: 'writer' },
            { id: 'c', text: 'review writer' },
            { id: 'd', text: 'draft' },
        ], {
            limit: 2,
            score: (entry) => scoreByTokens(entry.text, ['writer', 'review']),
        })

        expect(selection.omitted).toBe(2)
        expect(selection.selected.map((entry) => entry.id)).toEqual(['b', 'c'])
    })
})
