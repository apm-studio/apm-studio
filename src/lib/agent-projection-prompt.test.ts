import { describe, expect, it, vi } from 'vitest'
import type { CompilePromptRequest } from '../../shared/chat-contracts.js'
import { compileAgent } from '../../server/services/opencode-projection/agent-compiler.js'
import { getCompileRequestTargets } from '../../server/services/opencode-projection/preview-service.js'

vi.mock('../../server/lib/model-catalog.js', () => ({
    resolveRuntimeModel: vi.fn().mockResolvedValue(null),
}))

describe('agent prompt projection', () => {
    it('uses canonical requestTargets only', () => {
        const canonical: CompilePromptRequest = {
            instructionRef: null,
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5' },
            requestTargets: [{ agentId: 'peer-1', agentName: 'Peer One', description: 'Reviewer' }],
        }

        expect(getCompileRequestTargets(canonical)).toEqual(canonical.requestTargets)
        expect(getCompileRequestTargets({ instructionRef: null, skillRefs: [], model: { provider: 'openai', modelId: 'gpt-5' } })).toEqual([])
    })

    it('compiles stable agent prompt sections into the agent body', async () => {
        const compiled = await compileAgent(
            '/tmp/apm-studio',
            {
                agentId: 'reviewer',
                agentName: 'Reviewer',
                instructionRef: null,
                model: { provider: 'openai', modelId: 'gpt-5' },
                modelVariant: null,
                workspaceHash: 'workspacehash',
                executionDir: '/tmp/agent-projection-test',
                scope: 'workspace',
                skillNames: [],
                toolMap: { task: true },
                taskAllowlist: ['agent_peer'],
                relationPromptSection: '# Available Agents\n\n- **Peer**: use `task` with agent="agent_peer"',
            },
            [],
        )

        const system = compiled.agentContents.build
        expect(system).toContain('# Available Agents')
        expect(system).toContain('agent="agent_peer"')
    })

    it('omits a synthetic Instruction section when no Instruction is configured', async () => {
        const compiled = await compileAgent(
            '/tmp/apm-studio',
            {
                agentId: 'reviewer',
                agentName: 'Reviewer',
                instructionRef: null,
                model: { provider: 'openai', modelId: 'gpt-5' },
                modelVariant: null,
                workspaceHash: 'workspacehash',
                executionDir: '/tmp/agent-projection-test',
                scope: 'workspace',
                skillNames: [],
                toolMap: {},
            },
            [],
        )

        const system = compiled.agentContents.build
        expect(system).not.toContain('# Core Instructions')
        expect(system).not.toContain('No core instruction primitive is configured.')
    })
})
