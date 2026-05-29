import { describe, expect, it } from 'vitest'

import { normalizeImportedAgentPrimitive } from './agent-import'

describe('normalizeImportedAgentPrimitive', () => {
    it('keeps only currently available MCP names selected during import', () => {
        const normalized = normalizeImportedAgentPrimitive({
            name: 'Imported Agent',
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            mcpConfig: {
                github: { command: 'placeholder' },
                sentry: { url: 'https://mcp.sentry.dev/mcp' },
            },
        }, {
            runtimeModels: [
                {
                    provider: 'openai',
                    providerName: 'OpenAI',
                    id: 'gpt-5.4',
                    name: 'GPT-5.4',
                    connected: true,
                    context: 128000,
                    output: 16384,
                    toolCall: true,
                    reasoning: true,
                    attachment: true,
                    temperature: true,
                    modalities: {
                        input: ['text'],
                        output: ['text'],
                    },
                    variants: [],
                },
            ],
            availableMcpServerNames: ['github'],
        })

        expect(normalized.model).toEqual({ provider: 'openai', modelId: 'gpt-5.4' })
        expect(normalized.modelPlaceholder).toEqual({ provider: 'openai', modelId: 'gpt-5.4' })
        expect(normalized.mcpServerNames).toEqual(['github'])
        expect(normalized.mcpConfig).toEqual({
            github: { command: 'placeholder' },
            sentry: { url: 'https://mcp.sentry.dev/mcp' },
        })
    })
})
