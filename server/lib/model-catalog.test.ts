import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerListMock = vi.fn()
const readStoredProviderAuthTypeMock = vi.fn()

vi.mock('./opencode.js', () => ({
    getOpencode: async () => ({
        provider: {
            list: providerListMock,
        },
    }),
}))

vi.mock('./opencode-auth.js', () => ({
    readStoredProviderAuthType: readStoredProviderAuthTypeMock,
}))

function providerListResponse() {
    return {
        data: {
            all: [
                {
                    id: 'openai',
                    name: 'OpenAI',
                    source: 'builtin',
                    models: {
                        'gpt-5.5': {
                            id: 'gpt-5.5',
                            name: 'GPT-5.5',
                            capabilities: { toolcall: true },
                        },
                        'gpt-5.5-pro': {
                            id: 'gpt-5.5-pro',
                            name: 'GPT-5.5 Pro',
                            capabilities: { toolcall: true },
                        },
                        'gpt-5.1-codex-max': {
                            id: 'gpt-5.1-codex-max',
                            name: 'GPT-5.1 Codex Max',
                            capabilities: { toolcall: true },
                        },
                    },
                },
            ],
            connected: ['openai'],
            default: {},
        },
    }
}

describe('model catalog auth filtering', () => {
    beforeEach(() => {
        vi.resetModules()
        providerListMock.mockReset().mockResolvedValue(providerListResponse())
        readStoredProviderAuthTypeMock.mockReset().mockResolvedValue('oauth')
    })

    it('hides OpenAI GPT Pro models when Codex is authenticated with ChatGPT OAuth', async () => {
        const { listRuntimeModels } = await import('./model-catalog.js')

        const models = await listRuntimeModels('/tmp/workspace')

        expect(models.map((model) => model.id)).toEqual([
            'gpt-5.5',
            'gpt-5.1-codex-max',
        ])
    })

    it('keeps OpenAI GPT Pro models for API-key auth', async () => {
        readStoredProviderAuthTypeMock.mockResolvedValue('api')
        const { listRuntimeModels } = await import('./model-catalog.js')

        const models = await listRuntimeModels('/tmp/workspace')

        expect(models.map((model) => model.id)).toContain('gpt-5.5-pro')
    })

    it('rejects unsupported ChatGPT OAuth models before prompt execution', async () => {
        const { assertRuntimeModelPromptable } = await import('./model-catalog.js')

        await expect(assertRuntimeModelPromptable('/tmp/workspace', {
            provider: 'openai',
            modelId: 'gpt-5.5-pro',
        })).rejects.toMatchObject({
            action: 'choose_model',
            message: expect.stringContaining('gpt-5.5-pro'),
        })
        expect(providerListMock).not.toHaveBeenCalled()
    })

    it('normalizes provider summaries and runtime model entries at the OpenCode boundary', async () => {
        readStoredProviderAuthTypeMock.mockResolvedValue(null)
        providerListMock.mockResolvedValueOnce({
            data: {
                all: [
                    {
                        id: 'anthropic',
                        name: 'Anthropic',
                        source: 'builtin',
                        env: ['ANTHROPIC_API_KEY', 123],
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
                                ignored: 'drop-me',
                            },
                        },
                    },
                    { name: 'Missing id', models: {} },
                ],
                connected: ['anthropic', 42],
                default: { anthropic: 'claude-haiku-4.5', ignored: 123 },
            },
        })
        const { listProviderSummaries, listRuntimeModels } = await import('./model-catalog.js')

        await expect(listProviderSummaries('/tmp/workspace')).resolves.toEqual([
            {
                id: 'anthropic',
                name: 'Anthropic',
                source: 'builtin',
                env: ['ANTHROPIC_API_KEY'],
                connected: true,
                modelCount: 1,
                defaultModel: 'claude-haiku-4.5',
                hasPaidModels: true,
            },
        ])

        await expect(listRuntimeModels('/tmp/workspace')).resolves.toEqual([
            {
                provider: 'anthropic',
                providerName: 'Anthropic',
                id: 'claude-haiku-4.5',
                name: 'Claude Haiku',
                connected: true,
                context: 200000,
                output: 8192,
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
        ])
    })

    it('resolves title model candidates from normalized provider snapshots', async () => {
        providerListMock.mockResolvedValueOnce({
            data: {
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
                connected: ['amazon-bedrock'],
                default: {},
            },
        })
        const { resolvePreferredTitleModelId } = await import('./model-catalog.js')

        await expect(resolvePreferredTitleModelId('/tmp/workspace', 'amazon-bedrock'))
            .resolves.toBe('eu.anthropic.claude-haiku-4-5')
    })
})
