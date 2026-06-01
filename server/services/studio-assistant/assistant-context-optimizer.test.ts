import { describe, expect, it } from 'vitest'

import type { AssistantWorkspaceContext } from '../../../shared/assistant-actions.js'
import { optimizeAssistantWorkspaceContext } from './assistant-context-optimizer.js'

function agent(index: number, name = `Agent ${index}`): AssistantWorkspaceContext['agents'][number] {
    return {
        id: `agent-${index}`,
        name,
        description: `Description for ${name}`,
        position: { x: index * 10, y: index * 20 },
        size: { width: 320, height: 480 },
        hidden: index === 20,
        model: index === 1 ? { provider: 'openai', modelId: 'gpt-5-nano' } : null,
        modelVariant: null,
        skillUrns: [],
        skillDraftIds: [],
    }
}

describe('assistant context optimizer', () => {
    it('keeps selected and named agents in the optimized snapshot with geometry when requested', () => {
        const context: AssistantWorkspaceContext = {
            workingDir: '/tmp/workspace',
            view: {
                selectedAgentId: 'agent-20',
                selectedTeamId: null,
                selectedMarkdownEditorId: null,
                activeChatAgentId: null,
                viewMode: 'canvas',
                panels: {
                    packages: false,
                    workspaceTracking: false,
                    terminal: false,
                    assistant: true,
                },
            },
            agents: Array.from({ length: 22 }, (_, index) => agent(index + 1, index === 3 ? 'Writer' : undefined)),
            teams: [],
            drafts: [],
            availableModels: [],
        }

        const snapshot = optimizeAssistantWorkspaceContext(context, 'Writer 열어줘')

        expect(snapshot.context.omitted.agents).toBe(4)
        expect(snapshot.context.intent.geometry).toBe(true)
        expect(snapshot.agents.some((entry) => entry.name === 'Writer')).toBe(true)
        expect(snapshot.agents.find((entry) => entry.id === 'agent-20')).toEqual(expect.objectContaining({
            position: { x: 200, y: 400 },
            size: { width: 320, height: 480 },
            hidden: true,
        }))
    })

    it('prioritizes models already used by workspace agents', () => {
        const context: AssistantWorkspaceContext = {
            workingDir: '/tmp/workspace',
            agents: [agent(1)],
            teams: [],
            drafts: [],
            availableModels: Array.from({ length: 12 }, (_, index) => ({
                provider: index === 11 ? 'openai' : `provider-${index}`,
                providerName: index === 11 ? 'OpenAI' : `Provider ${index}`,
                modelId: index === 11 ? 'gpt-5-nano' : `model-${index}`,
                name: index === 11 ? 'GPT-5 Nano' : `Model ${index}`,
            })),
        }

        const snapshot = optimizeAssistantWorkspaceContext(context, 'choose runtime')

        expect(snapshot.context.omitted.availableModels).toBe(2)
        expect(snapshot.availableModels.some((model) => model.modelId === 'gpt-5-nano')).toBe(true)
    })
})
