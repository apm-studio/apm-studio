import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveRuntimeModelMock = vi.fn()

vi.mock('../../lib/model-catalog.js', () => ({
    resolveRuntimeModel: resolveRuntimeModelMock,
}))

describe('compileAgent scope boundaries', () => {
    beforeEach(() => {
        resolveRuntimeModelMock.mockReset().mockResolvedValue(null)
    })

    it('explicitly disables team collaboration tools for workspace agents', async () => {
        const { compileAgent } = await import('./agent-compiler.js')

        const compiled = await compileAgent('/tmp/workspace', {
            agentId: 'solo-agent',
            agentName: 'Solo Agent',
            instructionRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'workspace',
            skillNames: [],
            toolMap: {
                read: true,
            },
            relationPromptSection: null,
        }, [])

        const buildContent = compiled.agentContents.build || ''
        expect(buildContent).toContain('"apply_studio_actions": false')
        expect(buildContent).toContain('"message_teammate": false')
        expect(buildContent).toContain('"update_shared_board": false')
        expect(buildContent).toContain('"list_shared_board": false')
        expect(buildContent).toContain('"get_shared_board_entry": false')
        expect(buildContent).toContain('"wait_until": false')
    })

    it('keeps workspace agents in OpenCode projection output only', async () => {
        const { compileAgent } = await import('./agent-compiler.js')
        const agentBodyContent = 'Respond as a careful reviewer.\nNever mention internal abstractions.'

        const compiled = await compileAgent('/tmp/workspace', {
            agentId: 'Review Agent',
            agentName: 'Review Agent',
            instructionRef: null,
            agentBody: agentBodyContent,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'workspace',
            skillNames: ['skill-one'],
            toolMap: {},
            relationPromptSection: null,
        }, [{
            logicalName: 'skill-one',
            description: 'Skill one',
            filePath: '/tmp/workspace/.opencode/skills/skill-one/SKILL.md',
            relativePath: '.opencode/skills/skill-one/SKILL.md',
            content: '---\nname: "skill-one"\n---\n\nSkill body',
            additionalFiles: [],
            bundleChanged: false,
        }])

        expect(compiled.agentNames.build).toBe('apm-studio/workspace/workspace-hash/Review Agent--build')
        expect(compiled.allFiles).toContain('.opencode/agents/apm-studio/workspace/workspace-hash/Review Agent--build.md')
        expect(compiled.allFiles).toContain('.opencode/agents/apm-studio/workspace/workspace-hash/Review Agent--plan.md')
        expect(compiled.allFiles).toContain('.opencode/skills/skill-one/SKILL.md')
        expect(compiled.allFiles.some((file) => file.startsWith('.codex/'))).toBe(false)
        expect(compiled.allFiles.some((file) => file.startsWith('.agents/'))).toBe(false)
    })

    it('keeps team collaboration tools enabled only for team scope when requested', async () => {
        const { compileAgent } = await import('./agent-compiler.js')

        const compiled = await compileAgent('/tmp/workspace', {
            agentId: 'participant-reviewer',
            agentName: 'Reviewer',
            instructionRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'team',
            teamId: 'team-review',
            skillNames: [],
            toolMap: {
                read: true,
                message_teammate: true,
                update_shared_board: true,
                list_shared_board: true,
                get_shared_board_entry: true,
                wait_until: true,
            },
            relationPromptSection: null,
        }, [])

        const buildContent = compiled.agentContents.build || ''
        expect(buildContent).toContain('"apply_studio_actions": false')
        expect(buildContent).toContain('"message_teammate": true')
        expect(buildContent).toContain('"update_shared_board": true')
        expect(buildContent).toContain('"list_shared_board": true')
        expect(buildContent).toContain('"get_shared_board_entry": true')
        expect(buildContent).toContain('"wait_until": true')
        expect(compiled.allFiles.some((file) => file.startsWith('.codex/'))).toBe(false)
    })
})
