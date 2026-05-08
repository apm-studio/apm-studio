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
})
