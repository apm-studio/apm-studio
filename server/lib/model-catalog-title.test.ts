import { describe, expect, it } from 'vitest'

import { buildProviderSnapshots } from './model-catalog-normalization.js'
import { pickTitleModel } from './model-catalog-title.js'

describe('model catalog title model selection', () => {
    it('prefers GitHub Copilot mini title models before the shared low-cost fallback list', () => {
        const [provider] = buildProviderSnapshots({
            all: [
                {
                    id: 'github-copilot',
                    models: {
                        'anthropic.claude-haiku-4.5': {},
                        'openai.gpt-5-mini': {},
                    },
                },
            ],
        })

        expect(pickTitleModel(provider, 'github-copilot')).toBe('openai.gpt-5-mini')
    })

    it('prefers matching Bedrock regional prefixes before unprefixed title models', () => {
        const [provider] = buildProviderSnapshots({
            all: [
                {
                    id: 'amazon-bedrock',
                    options: { region: 'eu-west-1' },
                    models: {
                        'us.anthropic.claude-haiku-4-5': {},
                        'eu.anthropic.claude-haiku-4-5': {},
                        'anthropic.claude-haiku-4-5': {},
                    },
                },
            ],
        })

        expect(pickTitleModel(provider, 'amazon-bedrock')).toBe('eu.anthropic.claude-haiku-4-5')
    })

    it('returns null when the provider is missing or has no preferred title model', () => {
        expect(pickTitleModel(undefined, 'openai')).toBeNull()
        const [provider] = buildProviderSnapshots({
            all: [{ id: 'openai', models: { 'gpt-4.1': {} } }],
        })

        expect(pickTitleModel(provider, 'openai')).toBeNull()
    })
})
