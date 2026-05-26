import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const compileDanceMock = vi.fn()
const compilePerformerMock = vi.fn()
const resolveRuntimeToolsMock = vi.fn()
const resolveRuntimeModelMock = vi.fn()
const readGlobalMcpCatalogMock = vi.fn()
const mcpStatusMock = vi.fn()
const instanceDisposeMock = vi.fn()

vi.mock('./dance-compiler.js', () => ({
    compileDance: compileDanceMock,
}))

vi.mock('./performer-compiler.js', () => ({
    compilePerformer: compilePerformerMock,
    resolveCodexProjectAgentModelId: (model: { provider?: string; modelId?: string } | null | undefined) => {
        if (!model || model.provider !== 'openai') {
            return null
        }
        return model.modelId === 'gpt-5.4' || model.modelId === 'gpt-5.3-codex-spark'
            ? model.modelId
            : null
    },
}))

vi.mock('../../lib/runtime-tools.js', () => ({
    resolveRuntimeTools: resolveRuntimeToolsMock,
}))

vi.mock('../../lib/model-catalog.js', () => ({
    resolveRuntimeModel: resolveRuntimeModelMock,
}))

vi.mock('../../lib/mcp-catalog.js', () => ({
    readGlobalMcpCatalog: readGlobalMcpCatalogMock,
}))

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        mcp: { status: mcpStatusMock },
        instance: { dispose: instanceDisposeMock },
    }),
}))

describe('ensurePerformerProjection source boundaries', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-roaster-working-'))

        compileDanceMock.mockReset().mockResolvedValue({
            logicalName: 'draft-dance',
            description: 'Draft dance',
            filePath: path.join(workingDir, '.opencode', 'skills', 'draft-dance', 'SKILL.md'),
            relativePath: '.opencode/skills/draft-dance/SKILL.md',
            content: '---\nname: "draft-dance"\n---\n\nbody',
            additionalFiles: [],
            bundleChanged: false,
        })
        compilePerformerMock.mockReset().mockResolvedValue({
            performerId: 'performer-1',
            agentNames: { build: 'agent-roaster/workspace/hash/performer-1--build' },
            agentPaths: {
                build: path.join(workingDir, '.opencode', 'agents', 'agent-roaster', 'workspace', 'hash', 'performer-1--build.md'),
            },
            agentContents: {
                build: '---\ndescription: "Agent: Performer"\nmode: primary\n---\n\nbody',
            },
            skills: [],
            projectionHash: 'hash',
            allFiles: ['.opencode/agents/agent-roaster/workspace/hash/performer-1--build.md'],
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
        readGlobalMcpCatalogMock.mockReset().mockResolvedValue({})
        mcpStatusMock.mockReset().mockResolvedValue({ data: {} })
        instanceDisposeMock.mockReset().mockResolvedValue({})
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('uses workingDir, not executionDir, to resolve draft Tal and Dance sources', async () => {
        const { ensurePerformerProjection } = await import('./stage-projection-service.js')

        const result = await ensurePerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: { kind: 'draft', draftId: 'tal-draft-1' },
            danceRefs: [{ kind: 'draft', draftId: 'dance-draft-1' }],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
        })

        expect(result.changed).toBe(true)
        expect(compileDanceMock).toHaveBeenCalledWith(
            workingDir,
            { kind: 'draft', draftId: 'dance-draft-1' },
            expect.any(String),
            'performer-1',
            workingDir,
            'workspace',
            undefined,
        )
        expect(compilePerformerMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({
                performerId: 'performer-1',
                talRef: { kind: 'draft', draftId: 'tal-draft-1' },
                executionDir: workingDir,
            }),
            expect.any(Array),
        )
        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'agent-roaster.manifest.json'), 'utf-8'))
        expect(manifest.runtime).toEqual(expect.objectContaining({
            projectionPending: true,
        }))
    })

    it('projects performer MCP access as server glob patterns', async () => {
        resolveRuntimeToolsMock.mockResolvedValueOnce({
            selectedMcpServers: ['github'],
            requestedTools: ['github_*'],
            availableTools: ['github_*'],
            resolvedTools: ['github_*'],
            unavailableTools: [],
            unavailableDetails: [],
        })

        const { ensurePerformerProjection } = await import('./stage-projection-service.js')

        const result = await ensurePerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: ['github'],
            workingDir,
        })

        expect(result.changed).toBe(true)
        expect(compilePerformerMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({
                toolMap: {
                    'github_*': true,
                },
                includeCodexAgent: false,
            }),
            expect.any(Array),
        )
    })

    it('does not resolve Codex MCP projection during normal Studio projection', async () => {
        const githubMcpConfig = {
            type: 'local' as const,
            command: ['npx', '-y', '@modelcontextprotocol/server-github'],
        }
        resolveRuntimeToolsMock.mockResolvedValueOnce({
            selectedMcpServers: ['github'],
            requestedTools: ['github_*'],
            availableTools: [],
            resolvedTools: [],
            unavailableTools: ['github_*'],
            unavailableDetails: [{
                serverName: 'github',
                reason: 'connect_failed',
                detail: 'OpenCode could not connect.',
            }],
        })
        readGlobalMcpCatalogMock.mockResolvedValueOnce({
            github: githubMcpConfig,
        })

        const { ensurePerformerProjection } = await import('./stage-projection-service.js')

        const result = await ensurePerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: ['github'],
            workingDir,
        })

        expect(result.toolMap).toEqual({})
        expect(readGlobalMcpCatalogMock).not.toHaveBeenCalled()
        expect(compilePerformerMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({
                toolMap: {},
                includeCodexAgent: false,
            }),
            expect.any(Array),
        )
    })

    it('does not write Codex project agent definitions during normal Studio projection', async () => {
        const buildContent = '---\ndescription: "Agent: Performer"\nmode: primary\n---\n\nbody'
        const buildPath = path.join(workingDir, '.opencode', 'agents', 'agent-roaster', 'workspace', 'hash', 'performer-1--build.md')
        const codexRelativePath = '.codex/agents/agent_roaster_performer_1_deadbeef.toml'
        const codexPath = path.join(workingDir, codexRelativePath)
        const codexContent = [
            'name = "agent_roaster_performer_1_deadbeef"',
            'description = "Studio performer: Performer"',
            'sandbox_mode = "workspace-write"',
            'developer_instructions = "Follow Studio performer instructions."',
            '',
        ].join('\n')

        await fs.mkdir(path.dirname(buildPath), { recursive: true })
        await fs.writeFile(buildPath, buildContent, 'utf-8')
        compilePerformerMock.mockResolvedValueOnce({
            performerId: 'performer-1',
            agentNames: { build: 'agent-roaster/workspace/hash/performer-1--build' },
            agentPaths: {
                build: buildPath,
            },
            agentContents: {
                build: buildContent,
            },
            codexAgentName: 'agent_roaster_performer_1_deadbeef',
            codexAgentPath: codexPath,
            codexAgentContent: codexContent,
            codexAgentRelativePath: codexRelativePath,
            skills: [],
            projectionHash: 'hash',
            allFiles: [
                '.opencode/agents/agent-roaster/workspace/hash/performer-1--build.md',
                codexRelativePath,
            ],
        })

        const { ensurePerformerProjection } = await import('./stage-projection-service.js')

        const result = await ensurePerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
        })

        expect(result.changed).toBe(false)
        expect(result.codexChanged).toBe(false)
        await expect(fs.readFile(codexPath, 'utf-8')).rejects.toBeTruthy()

        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'agent-roaster.manifest.json'), 'utf-8'))
        expect(manifest.groups['performer:performer-1']).not.toContain(codexRelativePath)
        expect(manifest.runtime).toBeUndefined()
    })

    it('syncs Codex project agents immediately without rewriting OpenCode agent files', async () => {
        const buildPath = path.join(workingDir, '.opencode', 'agents', 'agent-roaster', 'workspace', 'hash', 'performer-1--build.md')
        const oldCodexRelativePath = '.codex/agents/agent_roaster_old_name.toml'
        const oldCodexPath = path.join(workingDir, oldCodexRelativePath)
        const codexRelativePath = '.codex/agents/agent_roaster_performer.toml'
        const codexPath = path.join(workingDir, codexRelativePath)
        const skillPath = path.join(workingDir, '.opencode', 'skills', 'draft-dance', 'SKILL.md')

        await fs.mkdir(path.dirname(buildPath), { recursive: true })
        await fs.mkdir(path.dirname(oldCodexPath), { recursive: true })
        await fs.writeFile(buildPath, 'existing OpenCode build', 'utf-8')
        await fs.writeFile(oldCodexPath, 'old codex', 'utf-8')
        await fs.writeFile(
            path.join(workingDir, '.opencode', 'agent-roaster.manifest.json'),
            JSON.stringify({
                version: 1,
                owner: 'agent-roaster',
                workspaceHash: 'hash',
                groups: {
                    'performer:performer-1': [
                        '.opencode/agents/agent-roaster/workspace/hash/performer-1--build.md',
                        oldCodexRelativePath,
                    ],
                },
            }, null, 2),
            'utf-8',
        )

        compileDanceMock.mockResolvedValueOnce({
            logicalName: 'draft-dance',
            description: 'Draft dance',
            filePath: skillPath,
            relativePath: '.opencode/skills/draft-dance/SKILL.md',
            content: '---\nname: "draft-dance"\n---\n\nupdated skill',
            additionalFiles: [],
            bundleChanged: false,
        })
        compilePerformerMock.mockResolvedValueOnce({
            performerId: 'performer-1',
            agentNames: { build: 'agent-roaster/workspace/hash/performer-1--build' },
            agentPaths: {
                build: buildPath,
            },
            agentContents: {
                build: 'new OpenCode build that should not be written',
            },
            codexAgentName: 'performer',
            codexAgentPath: codexPath,
            codexAgentContent: 'name = "performer"\n',
            codexAgentRelativePath: codexRelativePath,
            skills: [],
            projectionHash: 'hash',
            allFiles: [
                '.opencode/agents/agent-roaster/workspace/hash/performer-1--build.md',
                '.opencode/skills/draft-dance/SKILL.md',
                codexRelativePath,
            ],
        })

        const { ensureCodexPerformerProjection } = await import('../agent-sync/codex-agent-sync-provider.js')
        const result = await ensureCodexPerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: null,
            danceRefs: [{ kind: 'draft', draftId: 'dance-1' }],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
        })

        expect(result).toEqual(expect.objectContaining({
            changed: true,
            codexChanged: true,
            skillChanged: true,
            skipped: false,
        }))
        await expect(fs.readFile(buildPath, 'utf-8')).resolves.toBe('existing OpenCode build')
        await expect(fs.readFile(codexPath, 'utf-8')).resolves.toBe('name = "performer"\n')
        await expect(fs.readFile(skillPath, 'utf-8')).resolves.toContain('updated skill')
        await expect(fs.access(oldCodexPath)).rejects.toBeTruthy()
        const projectedSkill = compilePerformerMock.mock.calls[0][2][0]
        expect(projectedSkill.codexFilePath).toContain(`${path.sep}.agents${path.sep}skills${path.sep}agent-roaster-performer-1-draft-dance-`)
        expect(projectedSkill.codexFilePath).toMatch(/SKILL\.md$/)
        expect(projectedSkill.codexLinkRelativePath).toMatch(/^\.agents\/skills\/agent-roaster-performer-1-draft-dance-/)
        const linkStat = await fs.lstat(projectedSkill.codexLinkPath)
        expect(linkStat.isSymbolicLink()).toBe(true)
        await expect(fs.realpath(projectedSkill.codexLinkPath)).resolves.toBe(await fs.realpath(path.dirname(skillPath)))

        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'agent-roaster.manifest.json'), 'utf-8'))
        expect(manifest.groups['performer:performer-1']).toEqual(expect.arrayContaining([
            '.opencode/agents/agent-roaster/workspace/hash/performer-1--build.md',
            '.opencode/skills/draft-dance/SKILL.md',
            projectedSkill.codexLinkRelativePath,
            codexRelativePath,
        ]))
        expect(manifest.groups['performer:performer-1']).not.toContain(oldCodexRelativePath)
        expect(manifest.runtime).toBeUndefined()
    })

    it('projects selected MCP catalog entries into Codex agents without requiring OpenCode runtime resolution', async () => {
        const githubMcpConfig = {
            type: 'local' as const,
            command: ['npx', '-y', '@modelcontextprotocol/server-github'],
        }
        readGlobalMcpCatalogMock.mockResolvedValueOnce({
            github: githubMcpConfig,
        })

        const { ensureCodexPerformerProjection } = await import('../agent-sync/codex-agent-sync-provider.js')
        await ensureCodexPerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: ['github'],
            workingDir,
        })

        expect(resolveRuntimeToolsMock).not.toHaveBeenCalled()
        expect(compilePerformerMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({
                codexMcpServers: {
                    github: githubMcpConfig,
                },
                includeCodexAgent: true,
            }),
            expect.any(Array),
        )
    })

    it('removes stale Codex project agents immediately when the performer model is unsupported', async () => {
        const oldCodexRelativePath = '.codex/agents/agent_roaster_old_name.toml'
        const oldCodexPath = path.join(workingDir, oldCodexRelativePath)
        const oldSkillLinkRelativePath = '.agents/skills/agent-roaster-old-skill'
        const oldSkillLinkPath = path.join(workingDir, oldSkillLinkRelativePath)

        await fs.mkdir(path.dirname(oldCodexPath), { recursive: true })
        await fs.mkdir(oldSkillLinkPath, { recursive: true })
        await fs.mkdir(path.join(workingDir, '.opencode'), { recursive: true })
        await fs.writeFile(oldCodexPath, 'old codex', 'utf-8')
        await fs.writeFile(
            path.join(workingDir, '.opencode', 'agent-roaster.manifest.json'),
            JSON.stringify({
                version: 1,
                owner: 'agent-roaster',
                workspaceHash: 'hash',
                groups: {
                    'performer:performer-1': [oldCodexRelativePath, oldSkillLinkRelativePath],
                },
            }, null, 2),
            'utf-8',
        )

        const { ensureCodexPerformerProjection } = await import('../agent-sync/codex-agent-sync-provider.js')
        const result = await ensureCodexPerformerProjection({
            performerId: 'performer-1',
            performerName: 'Performer',
            talRef: null,
            danceRefs: [{ kind: 'draft', draftId: 'dance-1' }],
            model: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
        })

        expect(result).toEqual(expect.objectContaining({
            changed: false,
            codexChanged: false,
            skillChanged: false,
            skipped: true,
        }))
        expect(compileDanceMock).not.toHaveBeenCalled()
        expect(compilePerformerMock).not.toHaveBeenCalled()
        await expect(fs.access(oldCodexPath)).resolves.toBeUndefined()
        await expect(fs.access(oldSkillLinkPath)).resolves.toBeUndefined()

        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'agent-roaster.manifest.json'), 'utf-8'))
        expect(manifest.groups['performer:performer-1']).toEqual([oldCodexRelativePath, oldSkillLinkRelativePath])
    })

    it('keeps act collaboration context out of projected agent files', async () => {
        const { ensurePerformerProjection } = await import('./stage-projection-service.js')

        const first = await ensurePerformerProjection({
            performerId: 'Lead',
            performerName: 'Lead',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
            scope: 'act',
            actId: 'act-1',
        })
        const second = await ensurePerformerProjection({
            performerId: 'Lead',
            performerName: 'Lead',
            talRef: null,
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            mcpServerNames: [],
            workingDir,
            scope: 'act',
            actId: 'act-1',
        })

        expect(first.changed).toBe(true)
        expect(second.changed).toBe(false)
        expect(compilePerformerMock).toHaveBeenNthCalledWith(
            1,
            workingDir,
            expect.objectContaining({
                scope: 'act',
            }),
            expect.any(Array),
        )
        expect(compilePerformerMock).toHaveBeenNthCalledWith(
            2,
            workingDir,
            expect.objectContaining({
                scope: 'act',
            }),
            expect.any(Array),
        )
    })

    it('prunes stale performer agent files from the manifest', async () => {
        const workspaceHash = 'hash'
        const activeBuild = path.join(workingDir, '.opencode', 'agents', 'agent-roaster', 'workspace', workspaceHash, 'performer-1--build.md')
        const activePlan = path.join(workingDir, '.opencode', 'agents', 'agent-roaster', 'workspace', workspaceHash, 'performer-1--plan.md')
        const staleBuild = path.join(workingDir, '.opencode', 'agents', 'agent-roaster', 'workspace', workspaceHash, 'performer-2--build.md')
        const stalePlan = path.join(workingDir, '.opencode', 'agents', 'agent-roaster', 'workspace', workspaceHash, 'performer-2--plan.md')

        await fs.mkdir(path.dirname(activeBuild), { recursive: true })
        await fs.writeFile(activeBuild, 'active build', 'utf-8')
        await fs.writeFile(activePlan, 'active plan', 'utf-8')
        await fs.writeFile(staleBuild, 'stale build', 'utf-8')
        await fs.writeFile(stalePlan, 'stale plan', 'utf-8')
        await fs.writeFile(
            path.join(workingDir, '.opencode', 'agent-roaster.manifest.json'),
            JSON.stringify({
                version: 1,
                owner: 'agent-roaster',
                workspaceHash,
                groups: {
                    'performer:performer-1': [
                        '.opencode/agents/agent-roaster/workspace/hash/performer-1--build.md',
                        '.opencode/agents/agent-roaster/workspace/hash/performer-1--plan.md',
                    ],
                    'performer:performer-2': [
                        '.opencode/agents/agent-roaster/workspace/hash/performer-2--build.md',
                        '.opencode/agents/agent-roaster/workspace/hash/performer-2--plan.md',
                    ],
                },
            }, null, 2),
            'utf-8',
        )

        const { pruneStalePerformerProjections } = await import('./stage-projection-service.js')
        const changed = await pruneStalePerformerProjections(workingDir, ['performer-1'])

        expect(changed).toBe(true)
        await expect(fs.access(activeBuild)).resolves.toBeUndefined()
        await expect(fs.access(activePlan)).resolves.toBeUndefined()
        await expect(fs.access(staleBuild)).rejects.toBeTruthy()
        await expect(fs.access(stalePlan)).rejects.toBeTruthy()

        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'agent-roaster.manifest.json'), 'utf-8'))
        expect(manifest.groups).toEqual({
            'performer:performer-1': [
                '.opencode/agents/agent-roaster/workspace/hash/performer-1--build.md',
                '.opencode/agents/agent-roaster/workspace/hash/performer-1--plan.md',
            ],
        })
        expect(instanceDisposeMock).not.toHaveBeenCalled()
    })
})
