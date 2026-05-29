import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const compileSkillMock = vi.fn()
const compileAgentMock = vi.fn()
const resolveRuntimeToolsMock = vi.fn()
const resolveRuntimeModelMock = vi.fn()
const mcpStatusMock = vi.fn()
const instanceDisposeMock = vi.fn()

vi.mock('./skill-compiler.js', () => ({
    compileSkill: compileSkillMock,
}))

vi.mock('./agent-compiler.js', () => ({
    compileAgent: compileAgentMock,
}))

vi.mock('../../lib/runtime-tools.js', () => ({
    resolveRuntimeTools: resolveRuntimeToolsMock,
}))

vi.mock('../../lib/model-catalog.js', () => ({
    resolveRuntimeModel: resolveRuntimeModelMock,
}))

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        mcp: { status: mcpStatusMock },
        instance: { dispose: instanceDisposeMock },
    }),
}))

describe('ensureAgentProjection source boundaries', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-working-'))

        compileSkillMock.mockReset().mockResolvedValue({
            logicalName: 'draft-skill',
            description: 'Draft skill',
            filePath: path.join(workingDir, '.opencode', 'skills', 'draft-skill', 'SKILL.md'),
            relativePath: '.opencode/skills/draft-skill/SKILL.md',
            content: '---\nname: "draft-skill"\n---\n\nbody',
            additionalFiles: [],
            bundleChanged: false,
        })
        compileAgentMock.mockReset().mockResolvedValue({
            agentId: 'agent-1',
            agentNames: { build: 'apm-studio/workspace/hash/agent-1--build' },
            agentPaths: {
                build: path.join(workingDir, '.opencode', 'agents', 'apm-studio', 'workspace', 'hash', 'agent-1--build.md'),
            },
            agentContents: {
                build: '---\ndescription: "Agent: Agent"\nmode: primary\n---\n\nbody',
            },
            skills: [],
            projectionHash: 'hash',
            allFiles: ['.opencode/agents/apm-studio/workspace/hash/agent-1--build.md'],
        })
        resolveRuntimeToolsMock.mockReset().mockResolvedValue({
            selectedMcpServers: [],
            requestedTools: [],
            availableTools: [],
            resolvedTools: [],
            unavailableTools: [],
            unavailableDetails: [],
        })
        resolveRuntimeModelMock.mockReset().mockResolvedValue(null)
        mcpStatusMock.mockReset().mockResolvedValue({ data: {} })
        instanceDisposeMock.mockReset().mockResolvedValue({})
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('uses workingDir, not executionDir, to resolve draft Instruction and Skill sources', async () => {
        const { ensureAgentProjection } = await import('./workspace-agent-projection-service.js')

        const result = await ensureAgentProjection({
            agentId: 'agent-1',
            agentName: 'Agent',
            instructionRef: { kind: 'draft', draftId: 'instruction-draft-1' },
            skillRefs: [{ kind: 'draft', draftId: 'skill-draft-1' }],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
        })

        expect(result.changed).toBe(true)
        expect(compileSkillMock).toHaveBeenCalledWith(
            workingDir,
            { kind: 'draft', draftId: 'skill-draft-1' },
            expect.any(String),
            'agent-1',
            workingDir,
            'workspace',
            undefined,
        )
        expect(compileAgentMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({
                agentId: 'agent-1',
                instructionRef: { kind: 'draft', draftId: 'instruction-draft-1' },
                executionDir: workingDir,
            }),
            expect.any(Array),
        )
        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'apm-studio.manifest.json'), 'utf-8'))
        expect(manifest.runtime).toEqual(expect.objectContaining({
            projectionPending: true,
        }))
    })

    it('projects agent MCP access as server glob patterns', async () => {
        resolveRuntimeToolsMock.mockResolvedValueOnce({
            selectedMcpServers: ['github'],
            requestedTools: ['github_*'],
            availableTools: ['github_*'],
            resolvedTools: ['github_*'],
            unavailableTools: [],
            unavailableDetails: [],
        })

        const { ensureAgentProjection } = await import('./workspace-agent-projection-service.js')

        const result = await ensureAgentProjection({
            agentId: 'agent-1',
            agentName: 'Agent',
            instructionRef: null,
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: ['github'],
            workingDir,
        })

        expect(result.changed).toBe(true)
        expect(compileAgentMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({
                toolMap: {
                    'github_*': true,
                },
            }),
            expect.any(Array),
        )
    })

    it('keeps team collaboration context out of projected agent files', async () => {
        const { ensureAgentProjection } = await import('./workspace-agent-projection-service.js')

        const first = await ensureAgentProjection({
            agentId: 'Lead',
            agentName: 'Lead',
            instructionRef: null,
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
            scope: 'team',
            teamId: 'team-1',
        })
        const second = await ensureAgentProjection({
            agentId: 'Lead',
            agentName: 'Lead',
            instructionRef: null,
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
            scope: 'team',
            teamId: 'team-1',
        })

        expect(first.changed).toBe(true)
        expect(second.changed).toBe(false)
        expect(compileAgentMock).toHaveBeenNthCalledWith(
            1,
            workingDir,
            expect.objectContaining({
                scope: 'team',
            }),
            expect.any(Array),
        )
        expect(compileAgentMock).toHaveBeenNthCalledWith(
            2,
            workingDir,
            expect.objectContaining({
                scope: 'team',
            }),
            expect.any(Array),
        )
    })

    it('prunes stale agent agent files from the manifest', async () => {
        const workspaceHash = 'hash'
        const activeBuild = path.join(workingDir, '.opencode', 'agents', 'apm-studio', 'workspace', workspaceHash, 'agent-1--build.md')
        const activePlan = path.join(workingDir, '.opencode', 'agents', 'apm-studio', 'workspace', workspaceHash, 'agent-1--plan.md')
        const staleBuild = path.join(workingDir, '.opencode', 'agents', 'apm-studio', 'workspace', workspaceHash, 'agent-2--build.md')
        const stalePlan = path.join(workingDir, '.opencode', 'agents', 'apm-studio', 'workspace', workspaceHash, 'agent-2--plan.md')

        await fs.mkdir(path.dirname(activeBuild), { recursive: true })
        await fs.writeFile(activeBuild, 'active build', 'utf-8')
        await fs.writeFile(activePlan, 'active plan', 'utf-8')
        await fs.writeFile(staleBuild, 'stale build', 'utf-8')
        await fs.writeFile(stalePlan, 'stale plan', 'utf-8')
        await fs.writeFile(
            path.join(workingDir, '.opencode', 'apm-studio.manifest.json'),
            JSON.stringify({
                version: 1,
                owner: 'apm-studio',
                workspaceHash,
                groups: {
                    'agent:agent-1': [
                        '.opencode/agents/apm-studio/workspace/hash/agent-1--build.md',
                        '.opencode/agents/apm-studio/workspace/hash/agent-1--plan.md',
                    ],
                    'agent:agent-2': [
                        '.opencode/agents/apm-studio/workspace/hash/agent-2--build.md',
                        '.opencode/agents/apm-studio/workspace/hash/agent-2--plan.md',
                    ],
                },
            }, null, 2),
            'utf-8',
        )

        const { pruneStaleAgentProjections } = await import('./workspace-agent-projection-service.js')
        const changed = await pruneStaleAgentProjections(workingDir, ['agent-1'])

        expect(changed).toBe(true)
        await expect(fs.access(activeBuild)).resolves.toBeUndefined()
        await expect(fs.access(activePlan)).resolves.toBeUndefined()
        await expect(fs.access(staleBuild)).rejects.toBeTruthy()
        await expect(fs.access(stalePlan)).rejects.toBeTruthy()

        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'apm-studio.manifest.json'), 'utf-8'))
        expect(manifest.groups).toEqual({
            'agent:agent-1': [
                '.opencode/agents/apm-studio/workspace/hash/agent-1--build.md',
                '.opencode/agents/apm-studio/workspace/hash/agent-1--plan.md',
            ],
        })
        expect(instanceDisposeMock).not.toHaveBeenCalled()
    })
})
