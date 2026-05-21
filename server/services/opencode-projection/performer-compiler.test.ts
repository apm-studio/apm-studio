import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAssetPayloadMock = vi.fn()
const readDraftTextContentMock = vi.fn()
const resolveRuntimeModelMock = vi.fn()

vi.mock('../../lib/model-catalog.js', () => ({
    resolveRuntimeModel: resolveRuntimeModelMock,
}))

vi.mock('../draft-service.js', () => ({
    readDraftTextContent: readDraftTextContentMock,
}))

vi.mock('../../lib/dot-source.js', () => ({
    getAssetPayload: getAssetPayloadMock,
}))

describe('compilePerformer scope boundaries', () => {
    beforeEach(() => {
        getAssetPayloadMock.mockReset().mockResolvedValue(null)
        readDraftTextContentMock.mockReset().mockResolvedValue(null)
        resolveRuntimeModelMock.mockReset().mockResolvedValue(null)
    })

    it('explicitly disables act collaboration tools for workspace performers', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'solo-performer',
            performerName: 'Solo Performer',
            talRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'stage',
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
        expect(buildContent).toContain('"read_shared_board": false')
        expect(buildContent).toContain('"wait_until": false')
    })

    it('projects workspace performers as Codex project agent definitions', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')
        const talContent = 'Respond as a careful reviewer.\nNever mention internal abstractions.'
        getAssetPayloadMock.mockResolvedValueOnce(talContent)

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'Review Performer',
            performerName: 'Review Performer',
            talRef: { kind: 'registry', urn: 'tal:reviewer' },
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'stage',
            skillNames: ['dance-one'],
            toolMap: {},
            relationPromptSection: null,
        }, [{
            logicalName: 'dance-one',
            description: 'Dance one',
            filePath: '/tmp/workspace/.opencode/skills/dance-one/SKILL.md',
            relativePath: '.opencode/skills/dance-one/SKILL.md',
            codexFilePath: '/tmp/workspace/.agents/skills/dot-studio-review-dance-one/SKILL.md',
            codexRelativePath: '.agents/skills/dot-studio-review-dance-one/SKILL.md',
            codexLinkPath: '/tmp/workspace/.agents/skills/dot-studio-review-dance-one',
            codexLinkRelativePath: '.agents/skills/dot-studio-review-dance-one',
            content: '---\nname: "dance-one"\n---\n\nDance body',
            additionalFiles: [],
            bundleChanged: false,
        }])

        expect(compiled.codexAgentName).toBe('review_performer')
        expect(compiled.codexAgentRelativePath).toBe('.codex/agents/dot_studio_review_performer.toml')
        expect(compiled.allFiles).toContain('.codex/agents/dot_studio_review_performer.toml')
        expect(compiled.codexAgentContent).toContain(`name = "${compiled.codexAgentName}"`)
        expect(compiled.codexAgentContent).toContain('model = "gpt-5.4"')
        expect(compiled.codexAgentContent).toContain('model_reasoning_effort = "medium"')
        expect(compiled.codexAgentContent).toContain('sandbox_mode = "workspace-write"')
        expect(compiled.codexAgentContent).toContain('Custom agent for Review Performer.')
        expect(compiled.codexAgentContent).toContain('developer_instructions = """\n')
        const instructions = compiled.codexAgentContent!.match(/developer_instructions = """\n([\s\S]*?)\n"""/)?.[1] || ''
        expect(instructions).toBe(talContent)
        expect(compiled.codexAgentContent).toContain('[[skills.config]]')
        expect(compiled.codexAgentContent).toContain('path = "/tmp/workspace/.agents/skills/dot-studio-review-dance-one/SKILL.md"')
        expect(compiled.codexAgentContent).not.toContain('path = "/tmp/workspace/.opencode/skills/dance-one/SKILL.md"')
        expect(compiled.codexAgentContent).toContain('enabled = true')
        expect(instructions).not.toContain('Dance body')
        expect(instructions).not.toContain('Dance of Tal')
        expect(instructions).not.toContain('Studio')
    })

    it('does not fall back to OpenCode-only skill paths in Codex project agents', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'Review Performer',
            performerName: 'Review Performer',
            talRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'stage',
            skillNames: ['dance-one'],
            toolMap: {},
            relationPromptSection: null,
        }, [{
            logicalName: 'dance-one',
            description: 'Dance one',
            filePath: '/tmp/workspace/.opencode/skills/dance-one/SKILL.md',
            relativePath: '.opencode/skills/dance-one/SKILL.md',
            content: '---\nname: "dance-one"\n---\n\nDance body',
            additionalFiles: [],
            bundleChanged: false,
        }])

        expect(compiled.codexAgentContent).not.toContain('[[skills.config]]')
        expect(compiled.codexAgentContent).not.toContain('path = "/tmp/workspace/.opencode/skills/dance-one/SKILL.md"')
    })

    it('projects Codex Spark performers when the local Codex catalog supports the model', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'spark-reviewer',
            performerName: 'Spark Reviewer',
            talRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.3-codex-spark' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'stage',
            skillNames: [],
            toolMap: {},
            relationPromptSection: null,
        }, [])

        expect(compiled.codexAgentName).toBe('spark_reviewer')
        expect(compiled.codexAgentContent).toContain('model = "gpt-5.3-codex-spark"')
        expect(compiled.codexAgentContent).toContain('model_reasoning_effort = "high"')
    })

    it('projects reasoning effort from the selected model variant into Codex project agents', async () => {
        resolveRuntimeModelMock.mockResolvedValueOnce({
            provider: 'openai',
            providerName: 'OpenAI',
            id: 'gpt-5.4',
            name: 'GPT-5.4',
            connected: true,
            context: 0,
            output: 0,
            toolCall: true,
            reasoning: true,
            attachment: true,
            temperature: true,
            modalities: { input: ['text'], output: ['text'] },
            variants: [{
                id: 'reasoning-high',
                summary: 'reasoning.effort=high',
                options: { reasoning: { effort: 'high' } },
            }],
        })
        const { compilePerformer } = await import('./performer-compiler.js')

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'reasoning-reviewer',
            performerName: 'Reasoning Reviewer',
            talRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: 'reasoning-high',
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'stage',
            skillNames: [],
            toolMap: {},
            relationPromptSection: null,
        }, [])

        expect(compiled.codexAgentContent).toContain('model = "gpt-5.4"')
        expect(compiled.codexAgentContent).toContain('model_reasoning_effort = "high"')
    })

    it('projects performer MCP servers into Codex project agent definitions', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'mcp-performer',
            performerName: 'MCP Performer',
            talRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'stage',
            skillNames: [],
            toolMap: {
                'docs_*': true,
                'github_*': true,
            },
            codexMcpServers: {
                github: {
                    type: 'local',
                    command: ['npx', '-y', '@modelcontextprotocol/server-github'],
                    environment: {
                        GITHUB_TOKEN: '$GITHUB_TOKEN',
                        GITHUB_OWNER: 'dance-of-tal',
                    },
                    timeout: 1500,
                },
                'docs.remote': {
                    type: 'remote',
                    url: 'https://developers.openai.com/mcp',
                    headers: {
                        Authorization: 'Bearer ${OPENAI_DOCS_MCP_TOKEN}',
                        'X-Docs-Env': '$DOCS_REGION',
                        'X-Docs-Region': 'us-east-1',
                    },
                    timeout: 5000,
                },
            },
            relationPromptSection: null,
        }, [])

        expect(compiled.codexAgentContent).toContain('[mcp_servers.github]')
        expect(compiled.codexAgentContent).toContain('command = "npx"')
        expect(compiled.codexAgentContent).toContain('args = ["-y", "@modelcontextprotocol/server-github"]')
        expect(compiled.codexAgentContent).toContain('env_vars = ["GITHUB_TOKEN"]')
        expect(compiled.codexAgentContent).toContain('startup_timeout_sec = 2')
        expect(compiled.codexAgentContent).toContain('tool_timeout_sec = 2')
        expect(compiled.codexAgentContent).toContain('[mcp_servers.github.env]')
        expect(compiled.codexAgentContent).toContain('GITHUB_OWNER = "dance-of-tal"')
        expect(compiled.codexAgentContent).not.toContain('GITHUB_TOKEN = "$GITHUB_TOKEN"')
        expect(compiled.codexAgentContent).toContain('[mcp_servers."docs.remote"]')
        expect(compiled.codexAgentContent).toContain('url = "https://developers.openai.com/mcp"')
        expect(compiled.codexAgentContent).toContain('bearer_token_env_var = "OPENAI_DOCS_MCP_TOKEN"')
        expect(compiled.codexAgentContent).toContain('http_headers = { "X-Docs-Region" = "us-east-1" }')
        expect(compiled.codexAgentContent).toContain('env_http_headers = { "X-Docs-Env" = "DOCS_REGION" }')
        expect(compiled.codexAgentContent).toContain('startup_timeout_sec = 5')
        expect(compiled.codexAgentContent).toContain('tool_timeout_sec = 5')
        expect(compiled.codexAgentContent).not.toContain('"Authorization"')
    })

    it('skips Codex projection when the performer model is not supported by Codex', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')

        for (const model of [
            { provider: 'openai', modelId: 'gpt-5' },
            { provider: 'anthropic', modelId: 'claude-sonnet-4' },
        ]) {
            const compiled = await compilePerformer('/tmp/workspace', {
                performerId: `researcher-${model.provider}`,
                performerName: 'Researcher',
                talRef: null,
                model,
                modelVariant: null,
                workspaceHash: 'workspace-hash',
                executionDir: '/tmp/workspace',
                scope: 'stage',
                skillNames: [],
                toolMap: {},
                relationPromptSection: null,
            }, [])

            expect(compiled.codexAgentName).toBeUndefined()
            expect(compiled.codexAgentRelativePath).toBeUndefined()
            expect(compiled.allFiles.some((file) => file.startsWith('.codex/agents/'))).toBe(false)
        }
    })

    it('keeps act collaboration tools enabled only for act scope when requested', async () => {
        const { compilePerformer } = await import('./performer-compiler.js')

        const compiled = await compilePerformer('/tmp/workspace', {
            performerId: 'participant-reviewer',
            performerName: 'Reviewer',
            talRef: null,
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            workspaceHash: 'workspace-hash',
            executionDir: '/tmp/workspace',
            scope: 'act',
            actId: 'act-review',
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
        expect(compiled.codexAgentPath).toBeUndefined()
    })
})
