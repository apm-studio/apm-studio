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

vi.mock('../../lib/apm-asset-source.js', () => ({
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

    it('keeps workspace performers in OpenCode projection output only', async () => {
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
            content: '---\nname: "dance-one"\n---\n\nDance body',
            additionalFiles: [],
            bundleChanged: false,
        }])

        expect(compiled.agentNames.build).toBe('apm-studio/workspace/workspace-hash/Review Performer--build')
        expect(compiled.allFiles).toContain('.opencode/agents/apm-studio/workspace/workspace-hash/Review Performer--build.md')
        expect(compiled.allFiles).toContain('.opencode/agents/apm-studio/workspace/workspace-hash/Review Performer--plan.md')
        expect(compiled.allFiles).toContain('.opencode/skills/dance-one/SKILL.md')
        expect(compiled.allFiles.some((file) => file.startsWith('.codex/'))).toBe(false)
        expect(compiled.allFiles.some((file) => file.startsWith('.agents/'))).toBe(false)
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
        expect(compiled.allFiles.some((file) => file.startsWith('.codex/'))).toBe(false)
    })
})
