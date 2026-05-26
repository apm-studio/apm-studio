import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const listWorkspacePerformersForDirMock = vi.fn()
const compileDanceMock = vi.fn()
const compilePerformerMock = vi.fn()
const readGlobalMcpCatalogMock = vi.fn()

vi.mock('../workspace-service.js', () => ({
    listWorkspacePerformersForDir: listWorkspacePerformersForDirMock,
}))

vi.mock('../opencode-projection/dance-compiler.js', () => ({
    compileDance: compileDanceMock,
}))

vi.mock('../opencode-projection/performer-compiler.js', () => ({
    compilePerformer: compilePerformerMock,
    resolveCodexProjectAgentModelId: (model: { provider?: string; modelId?: string } | null | undefined) => {
        if (!model || model.provider !== 'openai') {
            return null
        }
        return model.modelId === 'gpt-5.4' ? model.modelId : null
    },
}))

vi.mock('../../lib/mcp-catalog.js', () => ({
    readGlobalMcpCatalog: readGlobalMcpCatalogMock,
}))

describe('codex agent sync provider', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-roster-agent-sync-'))
        listWorkspacePerformersForDirMock.mockReset().mockResolvedValue([
            {
                id: 'performer-1',
                name: 'Performer',
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                modelVariant: null,
                talRef: null,
                danceRefs: [],
                mcpServerNames: [],
            },
        ])
        compileDanceMock.mockReset()
        readGlobalMcpCatalogMock.mockReset().mockResolvedValue({})
        compilePerformerMock.mockReset().mockImplementation(async (cwd: string, input: { performerId: string; performerName: string }, skills = []) => {
            const relativePath = `.codex/agents/agent_roster_${input.performerId}.toml`
            return {
                performerId: input.performerId,
                agentNames: { build: `agent-roster/workspace/hash/${input.performerId}--build` },
                agentPaths: {
                    build: path.join(cwd, '.opencode', 'agents', 'agent-roster', 'workspace', 'hash', `${input.performerId}--build.md`),
                },
                agentContents: {
                    build: 'OpenCode build content',
                },
                codexAgentName: `agent_${input.performerId}`,
                codexAgentPath: path.join(cwd, relativePath),
                codexAgentContent: `name = "agent_${input.performerId}"\n`,
                codexAgentRelativePath: relativePath,
                skills,
                projectionHash: 'hash',
                allFiles: [
                    relativePath,
                    ...skills.map((skill: { relativePath: string }) => skill.relativePath),
                ],
            }
        })
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('reports stale status without writing Codex files', async () => {
        const { getCodexAgentSyncOverview } = await import('./codex-agent-sync-provider.js')

        const overview = await getCodexAgentSyncOverview(workingDir)

        expect(overview.performers[0]).toEqual(expect.objectContaining({
            status: 'stale',
            agentName: 'agent_performer-1',
        }))
        expect(compilePerformerMock).toHaveBeenCalledWith(
            workingDir,
            expect.objectContaining({ includeCodexAgent: true }),
            [],
        )
        await expect(fs.access(path.join(workingDir, '.codex', 'agents', 'agent_roster_performer-1.toml'))).rejects.toBeTruthy()
        await expect(fs.access(path.join(workingDir, '.opencode', 'agent-roster.manifest.json'))).rejects.toBeTruthy()
    })

    it('writes Codex files on manual sync and returns changed counts', async () => {
        const { syncCodexAgentSync } = await import('./codex-agent-sync-provider.js')

        const result = await syncCodexAgentSync(workingDir)

        expect(result).toEqual(expect.objectContaining({
            providerId: 'codex',
            projectedCount: 1,
            skippedCount: 0,
            failedCount: 0,
            changedCount: 1,
        }))
        await expect(fs.readFile(path.join(workingDir, '.codex', 'agents', 'agent_roster_performer-1.toml'), 'utf-8'))
            .resolves.toBe('name = "agent_performer-1"\n')
        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'agent-roster.manifest.json'), 'utf-8'))
        expect(manifest.groups['performer:performer-1']).toContain('.codex/agents/agent_roster_performer-1.toml')
    })

    it('prunes only provider-owned stale immediate artifacts', async () => {
        listWorkspacePerformersForDirMock.mockResolvedValueOnce([])
        const codexRelativePath = '.codex/agents/dot_studio_old.toml'
        const skillLinkRelativePath = '.agents/skills/dot-studio-old'
        const openCodeRelativePath = '.opencode/agents/dot-studio/workspace/hash/old--build.md'

        await fs.mkdir(path.join(workingDir, '.codex', 'agents'), { recursive: true })
        await fs.mkdir(path.join(workingDir, '.agents', 'skills', 'dot-studio-old'), { recursive: true })
        await fs.mkdir(path.dirname(path.join(workingDir, openCodeRelativePath)), { recursive: true })
        await fs.writeFile(path.join(workingDir, codexRelativePath), 'old codex', 'utf-8')
        await fs.writeFile(path.join(workingDir, openCodeRelativePath), 'old opencode', 'utf-8')
        await fs.mkdir(path.join(workingDir, '.opencode'), { recursive: true })
        await fs.writeFile(path.join(workingDir, '.opencode', 'dot-studio.manifest.json'), JSON.stringify({
            version: 1,
            owner: 'dot-studio',
            workspaceHash: 'hash',
            groups: {
                'performer:old': [codexRelativePath, skillLinkRelativePath, openCodeRelativePath],
            },
        }, null, 2), 'utf-8')

        const { pruneCodexAgentSync } = await import('./codex-agent-sync-provider.js')
        const result = await pruneCodexAgentSync(workingDir)

        expect(result.staleArtifactsPrunedCount).toBe(2)
        await expect(fs.access(path.join(workingDir, codexRelativePath))).rejects.toBeTruthy()
        await expect(fs.access(path.join(workingDir, skillLinkRelativePath))).rejects.toBeTruthy()
        await expect(fs.access(path.join(workingDir, openCodeRelativePath))).resolves.toBeUndefined()
        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'agent-roster.manifest.json'), 'utf-8'))
        expect(manifest.groups['performer:old']).toEqual([openCodeRelativePath])
        expect(manifest.owner).toBe('agent-roster')
    })

    it('reports unsupported models without failing', async () => {
        listWorkspacePerformersForDirMock.mockResolvedValueOnce([
            {
                id: 'performer-2',
                name: 'Claude Performer',
                model: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
                danceRefs: [],
                mcpServerNames: [],
            },
        ])
        const { getCodexAgentSyncOverview } = await import('./codex-agent-sync-provider.js')

        const overview = await getCodexAgentSyncOverview(workingDir)

        expect(overview.performers[0]).toEqual(expect.objectContaining({
            status: 'unsupported',
        }))
        expect(overview.provider.statusCounts.unsupported).toBe(1)
        expect(compilePerformerMock).not.toHaveBeenCalled()
    })
})
