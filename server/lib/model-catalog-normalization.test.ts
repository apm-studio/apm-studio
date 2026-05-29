import { describe, expect, it } from 'vitest'

import { buildProviderSnapshots } from './model-catalog-normalization.js'

describe('model catalog normalization', () => {
    it('normalizes OpenCode provider payloads into Studio provider snapshots', () => {
        expect(buildProviderSnapshots({
            all: [
                {
                    id: 'anthropic',
                    name: 'Anthropic',
                    source: 'builtin',
                    env: ['ANTHROPIC_API_KEY', 123],
                    options: { region: 'us-east-1' },
                    models: {
                        'claude-haiku-4.5': {
                            name: 'Claude Haiku',
                            limit: { context: 200000, output: 8192 },
                            capabilities: {
                                toolCall: true,
                                reasoning: true,
                                input: ['text', 'image', 1],
                                output: ['text', false],
                            },
                            cost: { input: 0.0008 },
                            variants: {
                                fast: { effort: 'low' },
                            },
                        },
                    },
                },
                { name: 'Missing id', models: {} },
            ],
            connected: ['anthropic', 42],
            default: { anthropic: 'claude-haiku-4.5', ignored: 123 },
        })).toEqual([
            {
                id: 'anthropic',
                name: 'Anthropic',
                source: 'builtin',
                env: ['ANTHROPIC_API_KEY'],
                region: 'us-east-1',
                connected: true,
                defaultModel: 'claude-haiku-4.5',
                hasPaidModels: true,
                models: [
                    {
                        id: 'claude-haiku-4.5',
                        name: 'Claude Haiku',
                        context: 200000,
                        output: 8192,
                        costInput: 0.0008,
                        toolCall: true,
                        reasoning: true,
                        attachment: false,
                        temperature: false,
                        modalities: {
                            input: ['text', 'image'],
                            output: ['text'],
                        },
                        variants: [
                            {
                                id: 'fast',
                                options: { effort: 'low' },
                                summary: 'effort=low',
                            },
                        ],
                    },
                ],
            },
        ])
    })

    it('returns an empty snapshot list for malformed payloads', () => {
        expect(buildProviderSnapshots(null)).toEqual([])
        expect(buildProviderSnapshots({ all: {} })).toEqual([])
    })
})
