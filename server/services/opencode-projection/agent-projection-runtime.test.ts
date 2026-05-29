import { describe, expect, it, vi } from 'vitest'

const resolveRuntimeToolsMock = vi.hoisted(() => vi.fn())
const resolveRuntimeModelMock = vi.hoisted(() => vi.fn())

vi.mock('../../lib/runtime-tools.js', () => ({
    resolveRuntimeTools: resolveRuntimeToolsMock,
}))

vi.mock('../../lib/model-catalog.js', () => ({
    resolveRuntimeModel: resolveRuntimeModelMock,
}))

describe('resolveAgentProjectionRuntime', () => {
    it('resolves available MCP tools, extra tools, and model capabilities', async () => {
        resolveRuntimeToolsMock.mockResolvedValueOnce({
            selectedMcpServers: ['github', 'slack'],
            requestedTools: ['github_*', 'slack_*'],
            availableTools: ['github_*'],
            resolvedTools: ['github_*'],
            unavailableTools: ['slack_*'],
            unavailableDetails: [],
        })
        resolveRuntimeModelMock.mockResolvedValueOnce({
            toolCall: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            modalities: {
                input: ['text'],
                output: ['text'],
            },
        })

        const { resolveAgentProjectionRuntime } = await import('./agent-projection-runtime.js')
        const runtime = await resolveAgentProjectionRuntime({
            workingDir: '/tmp/workspace',
            model: {
                provider: 'openai',
                modelId: 'gpt-5',
            },
            mcpServerNames: ['github', 'slack'],
            extraTools: [{
                name: 'wait_until',
                content: 'export default {}',
            }],
        })

        expect(resolveRuntimeToolsMock).toHaveBeenCalledWith(
            '/tmp/workspace',
            {
                provider: 'openai',
                modelId: 'gpt-5',
            },
            ['github', 'slack'],
        )
        expect(runtime.toolMap).toEqual({
            'github_*': true,
            wait_until: true,
        })
        expect(runtime.capabilitySnapshot).toEqual({
            toolCall: true,
            reasoning: true,
            attachment: false,
            temperature: true,
            modalities: {
                input: ['text'],
                output: ['text'],
            },
        })
    })
})
