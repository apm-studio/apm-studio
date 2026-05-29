import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const instanceDisposeMock = vi.fn().mockResolvedValue({})
const listApmPackagesMock = vi.fn()
const searchImportCatalogMock = vi.fn()
let studioDir = ''

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        instance: { dispose: instanceDisposeMock },
    }),
}))

vi.mock('../../lib/config.js', () => ({
    get STUDIO_DIR() {
        return studioDir
    },
}))

vi.mock('../apm-package/repository.js', () => ({
    listApmPackages: listApmPackagesMock,
}))

vi.mock('../import/registry-service.js', () => ({
    searchImportCatalog: searchImportCatalogMock,
}))

describe('ensureAssistantAgent', () => {
    let executionDir: string

    beforeEach(async () => {
        executionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-assistant-projection-'))
        studioDir = path.join(executionDir, '.studio-home')
        instanceDisposeMock.mockClear()
        listApmPackagesMock.mockReset().mockResolvedValue([])
        searchImportCatalogMock.mockReset().mockResolvedValue({ listings: [] })
    })

    afterEach(async () => {
        await fs.rm(executionDir, { recursive: true, force: true }).catch(() => {})
    })

    it('projects builtin skill sibling files and prunes stale siblings', async () => {
        const staleFile = path.join(
            studioDir,
            'opencode',
            'skills',
            'apm-studio',
            'studio-assistant-skill-creator-guide',
            'references',
            'stale.md',
        )
        await fs.mkdir(path.dirname(staleFile), { recursive: true })
        await fs.writeFile(staleFile, 'stale\n', 'utf-8')
        const staleSkillDir = path.join(
            studioDir,
            'opencode',
            'skills',
            'apm-studio',
            'stale-flat-skill',
        )
        await fs.mkdir(staleSkillDir, { recursive: true })
        await fs.writeFile(path.join(staleSkillDir, 'SKILL.md'), '# stale\n', 'utf-8')

        const { ensureAssistantAgent } = await import('./assistant-service.js')

        const agentName = await ensureAssistantAgent(executionDir)

        expect(agentName).toBe('apm-studio/studio-assistant')
        const projectedAgent = await fs.readFile(path.join(
            studioDir,
            'opencode',
            'agents',
            'apm-studio',
            'studio-assistant.md',
        ), 'utf-8')
        expect(projectedAgent).toContain('"*": false')
        expect(projectedAgent).toContain('"apply_studio_actions": true')
        expect(projectedAgent).toContain('"find-skills": "allow"')
        const projectedTool = await fs.readFile(path.join(
            studioDir,
            'opencode',
            'tools',
            'apply_studio_actions.ts',
        ), 'utf-8')
        expect(projectedTool).toContain('Apply APM Studio workspace mutations')
        expect(projectedTool).toContain('lintAssistantActionEnvelope')
        expect(projectedTool).toContain('rejected the mutation envelope')
        expect(projectedTool).not.toContain('../../shared/assistant-action-protocol.js')
        await expect(fs.readFile(path.join(
            studioDir,
            'opencode',
            'skills',
            'apm-studio',
            'find-skills',
            'SKILL.md',
        ), 'utf-8')).resolves.toContain('Find Skills')
        await expect(fs.readFile(path.join(
            studioDir,
            'opencode',
            'skills',
            'apm-studio',
            'studio-assistant-skill-creator-guide',
            'references',
            'bundle-authoring.md',
        ), 'utf-8')).resolves.toContain('SKILL.md')
        await expect(fs.stat(staleFile)).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(staleSkillDir)).rejects.toMatchObject({ code: 'ENOENT' })
        expect(instanceDisposeMock).toHaveBeenCalledWith({ directory: executionDir })
    })

    it('removes duplicate assistant projection from ancestor directories', async () => {
        const ancestorDir = executionDir
        const childDir = path.join(executionDir, 'nested', 'workspace')

        await fs.mkdir(path.join(ancestorDir, '.opencode', 'tools'), { recursive: true })
        await fs.mkdir(path.join(ancestorDir, '.opencode', 'agents', 'apm-studio'), { recursive: true })
        await fs.mkdir(path.join(ancestorDir, '.opencode', 'skills', 'apm-studio', 'find-skills'), { recursive: true })
        await fs.writeFile(path.join(ancestorDir, '.opencode', 'tools', 'apply_studio_actions.ts'), 'local tool\n', 'utf-8')
        await fs.writeFile(path.join(ancestorDir, '.opencode', 'agents', 'apm-studio', 'studio-assistant.md'), 'local agent\n', 'utf-8')
        await fs.writeFile(path.join(ancestorDir, '.opencode', 'skills', 'apm-studio', 'find-skills', 'SKILL.md'), 'local skill\n', 'utf-8')

        const { ensureAssistantAgent } = await import('./assistant-service.js')
        await ensureAssistantAgent(childDir)

        await expect(fs.stat(path.join(ancestorDir, '.opencode', 'tools', 'apply_studio_actions.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(ancestorDir, '.opencode', 'agents', 'apm-studio', 'studio-assistant.md'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(ancestorDir, '.opencode', 'skills', 'apm-studio', 'find-skills'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(studioDir, 'opencode', 'tools', 'apply_studio_actions.ts'))).resolves.toBeTruthy()
    })

    it('removes duplicate assistant projection from descendant directories', async () => {
        const parentDir = executionDir
        const childDir = path.join(executionDir, 'nested', 'workspace')

        await fs.mkdir(path.join(childDir, '.opencode', 'tools'), { recursive: true })
        await fs.mkdir(path.join(childDir, '.opencode', 'agents', 'apm-studio'), { recursive: true })
        await fs.mkdir(path.join(childDir, '.opencode', 'skills', 'apm-studio', 'find-skills'), { recursive: true })
        await fs.writeFile(path.join(childDir, '.opencode', 'tools', 'apply_studio_actions.ts'), 'local tool\n', 'utf-8')
        await fs.writeFile(path.join(childDir, '.opencode', 'agents', 'apm-studio', 'studio-assistant.md'), 'local agent\n', 'utf-8')
        await fs.writeFile(path.join(childDir, '.opencode', 'skills', 'apm-studio', 'find-skills', 'SKILL.md'), 'local skill\n', 'utf-8')

        const { ensureAssistantAgent } = await import('./assistant-service.js')
        await ensureAssistantAgent(parentDir)

        await expect(fs.stat(path.join(childDir, '.opencode', 'tools', 'apply_studio_actions.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(childDir, '.opencode', 'agents', 'apm-studio', 'studio-assistant.md'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(childDir, '.opencode', 'skills', 'apm-studio', 'find-skills'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(studioDir, 'opencode', 'tools', 'apply_studio_actions.ts'))).resolves.toBeTruthy()
    })

    it('projects assistant artifacts into the global sidecar config and prunes local duplicates', async () => {
        await fs.mkdir(path.join(executionDir, '.opencode', 'tools'), { recursive: true })
        await fs.mkdir(path.join(executionDir, '.opencode', 'agents', 'apm-studio'), { recursive: true })
        await fs.writeFile(path.join(executionDir, '.opencode', 'tools', 'apply_studio_actions.ts'), 'local tool\n', 'utf-8')
        await fs.writeFile(path.join(executionDir, '.opencode', 'agents', 'apm-studio', 'studio-assistant.md'), 'local agent\n', 'utf-8')

        const { ensureAssistantAgent } = await import('./assistant-service.js')
        await ensureAssistantAgent(executionDir)

        await expect(fs.stat(path.join(executionDir, '.opencode', 'tools', 'apply_studio_actions.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(executionDir, '.opencode', 'agents', 'apm-studio', 'studio-assistant.md'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(studioDir, 'opencode', 'tools', 'apply_studio_actions.ts'))).resolves.toBeTruthy()
        await expect(fs.stat(path.join(studioDir, 'opencode', 'agents', 'apm-studio', 'studio-assistant.md'))).resolves.toBeTruthy()
        await expect(fs.stat(path.join(studioDir, 'opencode', 'skills', 'apm-studio', 'find-skills', 'SKILL.md'))).resolves.toBeTruthy()
    })

    it('builds a compact action prompt that steers clear mutations into the Studio tool', async () => {
        const { buildAssistantActionPrompt } = await import('./assistant-context-prompt.js')

        const prompt = buildAssistantActionPrompt({
            workingDir: '/tmp/workspace',
            agents: [],
            teams: [],
            drafts: [],
            availableModels: [],
        }, 'create a review workflow')

        expect(prompt).toContain('Current Workspace Snapshot (optimized for this turn)')
        expect(prompt).toContain('"optimized": true')
        expect(prompt).toContain('Use the snapshot as the source of truth')
        expect(prompt).toContain('Action decision:')
        expect(prompt).toContain('call `apply_studio_actions`; do not stop at describing what you would change')
        expect(prompt).toContain('studio-assistant-action-surface-guide')
        expect(prompt).toContain('studio-assistant-agent-guide')
        expect(prompt).toContain('studio-assistant-team-guide')
        expect(prompt).toContain('studio-assistant-workflow-guide')
        expect(prompt).toContain('studio-assistant-instruction-design-guide')
        expect(prompt).toContain('studio-assistant-ui-operations-guide')
        expect(prompt).toContain('Use `showAgent`, `showTeam`, `showDraft`, `setStudioPanel`, `setStudioNodeVisibility`, or `setStudioNodeFrame`')
        expect(prompt).toContain('Never invent ids')
        expect(prompt).toContain('Use same-call refs only for objects created earlier')
        expect(prompt).toContain('Instruction and Skill actions are draft-only')
        expect(prompt).toContain('package import and target sync are outside this tool surface')
        expect(prompt).toContain('missing Instruction/Skill/model details alone should not block mutation')
        expect(prompt).toContain('Relation payloads use `source...` and `target...` fields only')
        expect(prompt).toContain('`teamRules` is always an array of strings')
    })

    it('optimizes assistant workspace context by intent while preserving UI geometry when needed', async () => {
        const { buildAssistantActionPrompt } = await import('./assistant-context-prompt.js')
        const agents = Array.from({ length: 22 }, (_, index) => ({
            id: `agent-${index + 1}`,
            name: index === 20 ? 'Writer' : `Agent ${index + 1}`,
            description: `Long description for agent ${index + 1}. `.repeat(20),
            position: { x: index * 10, y: index * 20 },
            size: { width: 320, height: 480 },
            hidden: index === 20,
            model: null,
            modelVariant: null,
            instructionUrn: null,
            instructionDraftId: null,
            skillUrns: [],
            skillDraftIds: [],
        }))

        const prompt = buildAssistantActionPrompt({
            workingDir: '/tmp/workspace',
            view: {
                selectedAgentId: null,
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
            agents: agents,
            teams: [],
            drafts: [],
            availableModels: [],
        }, 'Writer 열어줘')

        const snapshot = JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```/)?.[1] || '{}')
        expect(snapshot.context.omitted.agents).toBe(4)
        expect(snapshot.context.intent.geometry).toBe(true)
        expect(snapshot.agents).toHaveLength(18)
        expect(snapshot.agents.some((agent: { name: string }) => agent.name === 'Writer')).toBe(true)
        expect(snapshot.agents.find((agent: { name: string }) => agent.name === 'Writer')).toEqual(expect.objectContaining({
            position: { x: 200, y: 400 },
            size: { width: 320, height: 480 },
            hidden: true,
        }))
    })

    it('adds package-oriented skill intent hints for find/apply requests', async () => {
        const { buildAssistantDiscoveryPrompt } = await import('./assistant-discovery-prompt.js')

        const prompt = await buildAssistantDiscoveryPrompt(executionDir, 'find a skill and apply it to my researcher agent')

        expect(prompt).toContain('Skill Intent Hint:')
        expect(prompt).toContain('Load and use `find-skills`.')
        expect(prompt).toContain('warn the user briefly to review the source repo')
        expect(prompt).toContain('Prefer local Studio package matches first, then Import matches.')
        expect(prompt).not.toContain('skills.sh Skill matches:')
    })

    it('uses local APM packages for discovery hints', async () => {
        listApmPackagesMock.mockResolvedValue([
            {
                packageId: 'release-notes',
                name: 'Release Notes',
                kind: 'skill',
                description: 'Generate release notes from commits',
                source: 'apm',
                manifestPath: 'packages/release-notes/apm.yml',
            },
        ])
        const { buildAssistantDiscoveryPrompt } = await import('./assistant-discovery-prompt.js')

        const prompt = await buildAssistantDiscoveryPrompt(executionDir, 'find release notes skill')

        expect(prompt).toContain('Local Package Skill matches:')
        expect(prompt).toContain('Release Notes (release-notes) [packages/release-notes/apm.yml]')
    })

    it('steers create requests toward local Skill authoring instead of external search', async () => {
        const { buildAssistantDiscoveryPrompt } = await import('./assistant-discovery-prompt.js')

        const prompt = await buildAssistantDiscoveryPrompt(executionDir, 'create a new skill for release notes')

        expect(prompt).toContain('The user likely wants to create or improve a local Skill.')
        expect(prompt).toContain('Load and use `studio-assistant-skill-creator-guide`.')
        expect(prompt).not.toContain('skills.sh Skill matches:')
    })

    it('understands Korean skill authoring intent even when there is no package query', async () => {
        const { buildAssistantDiscoveryPrompt } = await import('./assistant-discovery-prompt.js')

        const prompt = await buildAssistantDiscoveryPrompt(executionDir, '새 스킬 만들어줘')

        expect(prompt).toContain('The user likely wants to create or improve a local Skill.')
        expect(prompt).toContain('Load and use `studio-assistant-skill-creator-guide`.')
    })
})
