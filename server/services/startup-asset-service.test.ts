import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    getSavedWorkspaceMock,
    installDotAssetMock,
    listRuntimeModelsMock,
    listSavedWorkspacesMock,
    listStudioAssetsMock,
    readGlobalMcpCatalogMock,
    saveWorkspaceSnapshotMock,
} = vi.hoisted(() => ({
    getSavedWorkspaceMock: vi.fn(),
    installDotAssetMock: vi.fn(),
    listRuntimeModelsMock: vi.fn(),
    listSavedWorkspacesMock: vi.fn(),
    listStudioAssetsMock: vi.fn(),
    readGlobalMcpCatalogMock: vi.fn(),
    saveWorkspaceSnapshotMock: vi.fn(),
}))

vi.mock('./asset-service.js', () => ({
    listStudioAssets: listStudioAssetsMock,
}))

vi.mock('./dot-service.js', () => ({
    installDotAsset: installDotAssetMock,
}))

vi.mock('./workspace-service.js', () => ({
    getSavedWorkspace: getSavedWorkspaceMock,
    listSavedWorkspaces: listSavedWorkspacesMock,
    saveWorkspaceSnapshot: saveWorkspaceSnapshotMock,
}))

vi.mock('../lib/model-catalog.js', () => ({
    listRuntimeModels: listRuntimeModelsMock,
}))

vi.mock('../lib/mcp-catalog.js', () => ({
    readGlobalMcpCatalog: readGlobalMcpCatalogMock,
}))

const runtimeModel = {
    provider: 'openai',
    providerName: 'OpenAI',
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    connected: true,
    context: 1000,
    output: 1000,
    toolCall: true,
    reasoning: true,
    attachment: false,
    temperature: true,
    modalities: { input: ['text'], output: ['text'] },
    variants: [],
}

const performerAsset = {
    kind: 'performer' as const,
    urn: 'performer/@acme/workflows/reviewer',
    slug: 'reviewer',
    name: 'reviewer',
    author: '@acme',
    source: 'stage' as const,
    description: 'Review things',
    tags: ['review'],
    talUrn: 'tal/@acme/workflows/reviewer-tal',
    danceUrns: ['dance/@acme/workflows/review-dance'],
    model: { provider: 'openai', modelId: 'gpt-5.4' },
    modelVariant: null,
    mcpConfig: { servers: ['github', 'missing'] },
}

describe('prepareStartupAssetTarget', () => {
    beforeEach(() => {
        getSavedWorkspaceMock.mockReset()
        installDotAssetMock.mockReset().mockResolvedValue({ ok: true })
        listRuntimeModelsMock.mockReset().mockResolvedValue([runtimeModel])
        listSavedWorkspacesMock.mockReset().mockResolvedValue([])
        listStudioAssetsMock.mockReset()
        readGlobalMcpCatalogMock.mockReset().mockResolvedValue({
            github: { type: 'local', command: ['gh'] },
        })
        saveWorkspaceSnapshotMock.mockReset().mockResolvedValue({
            ok: true,
            id: 'workspace-1',
            workingDir: '/tmp/workspace',
            updatedAt: 1,
            hiddenFromList: false,
        })
    })

    it('installs and imports a startup performer into the workspace before launch', async () => {
        listStudioAssetsMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([performerAsset])

        const { prepareStartupAssetTarget } = await import('./startup-asset-service.js')
        const result = await prepareStartupAssetTarget('/tmp/workspace', {
            kind: 'performer',
            urn: performerAsset.urn,
        })

        expect(installDotAssetMock).toHaveBeenCalledWith('/tmp/workspace', {
            urn: performerAsset.urn,
            force: false,
            scope: 'stage',
        })
        expect(result).toEqual({
            kind: 'performer',
            urn: performerAsset.urn,
            nodeId: 'performer-1',
            created: true,
            workspaceId: 'workspace-1',
        })
        expect(saveWorkspaceSnapshotMock).toHaveBeenCalledTimes(1)
        const snapshot = saveWorkspaceSnapshotMock.mock.calls[0][0]
        expect(snapshot.performers).toHaveLength(1)
        expect(snapshot.performers[0]).toEqual(expect.objectContaining({
            id: 'performer-1',
            name: 'reviewer',
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelPlaceholder: { provider: 'openai', modelId: 'gpt-5.4' },
            talRef: { kind: 'registry', urn: performerAsset.talUrn },
            danceRefs: [{ kind: 'registry', urn: performerAsset.danceUrns[0] }],
            mcpServerNames: [],
            mcpBindingMap: { github: 'github' },
            declaredMcpConfig: performerAsset.mcpConfig,
            meta: {
                derivedFrom: performerAsset.urn,
                publishBindingUrn: performerAsset.urn,
            },
        }))
    })

    it('imports a startup act and materializes its participant performers', async () => {
        const actAsset = {
            kind: 'act' as const,
            urn: 'act/@acme/workflows/review-flow',
            slug: 'review-flow',
            name: 'review-flow',
            author: '@acme',
            source: 'stage' as const,
            description: 'Review flow',
            tags: [],
            actRules: ['Keep reviews crisp.'],
            participants: [
                {
                    key: 'Lead',
                    performer: performerAsset.urn,
                    subscriptions: { messagesFrom: ['Lead'], callboardKeys: ['brief'] },
                },
            ],
            relations: [],
        }
        let actInstalled = false
        listStudioAssetsMock.mockImplementation(async (_cwd: string, kind: string) => {
            if (kind === 'act') {
                return actInstalled ? [actAsset] : []
            }
            if (kind === 'performer') {
                return [performerAsset]
            }
            return []
        })
        installDotAssetMock.mockImplementation(async () => {
            actInstalled = true
            return { ok: true }
        })

        const { prepareStartupAssetTarget } = await import('./startup-asset-service.js')
        const result = await prepareStartupAssetTarget('/tmp/workspace', {
            kind: 'act',
            urn: actAsset.urn,
        })

        expect(result).toEqual(expect.objectContaining({
            kind: 'act',
            urn: actAsset.urn,
            created: true,
            workspaceId: 'workspace-1',
        }))
        const snapshot = saveWorkspaceSnapshotMock.mock.calls[0][0]
        expect(snapshot.acts).toHaveLength(1)
        expect(snapshot.acts[0]).toEqual(expect.objectContaining({
            name: 'review-flow',
            description: 'Review flow',
            actRules: ['Keep reviews crisp.'],
            meta: {
                derivedFrom: actAsset.urn,
                authoring: { description: 'Review flow' },
            },
        }))
        expect(Object.values(snapshot.acts[0].participants)[0]).toEqual(expect.objectContaining({
            performerRef: { kind: 'registry', urn: performerAsset.urn },
            displayName: 'Lead',
            subscriptions: expect.objectContaining({ callboardKeys: ['brief'] }),
        }))
        expect(snapshot.performers).toHaveLength(1)
        expect(snapshot.performers[0]).toEqual(expect.objectContaining({
            name: 'Lead',
            hidden: true,
            meta: expect.objectContaining({
                derivedFrom: performerAsset.urn,
                authoring: {
                    slug: 'reviewer',
                    description: 'Review things',
                    tags: ['review'],
                },
            }),
        }))
    })

    it('does not duplicate an existing startup performer', async () => {
        listSavedWorkspacesMock.mockResolvedValueOnce([
            { id: 'workspace-1', workingDir: '/tmp/workspace', updatedAt: 1 },
        ])
        getSavedWorkspaceMock.mockResolvedValueOnce({
            ok: true,
            workspace: {
                schemaVersion: 1,
                workingDir: '/tmp/workspace',
                performers: [
                    {
                        id: 'performer-7',
                        name: 'reviewer',
                        position: { x: 0, y: 0 },
                        scope: 'shared',
                        model: null,
                        talRef: null,
                        danceRefs: [],
                        mcpServerNames: [],
                        meta: { derivedFrom: performerAsset.urn },
                    },
                ],
                acts: [],
                markdownEditors: [],
            },
        })
        listStudioAssetsMock.mockResolvedValueOnce([performerAsset])

        const { prepareStartupAssetTarget } = await import('./startup-asset-service.js')
        const result = await prepareStartupAssetTarget('/tmp/workspace/', {
            kind: 'performer',
            urn: performerAsset.urn,
        })

        expect(result).toEqual({
            kind: 'performer',
            urn: performerAsset.urn,
            nodeId: 'performer-7',
            created: false,
        })
        expect(saveWorkspaceSnapshotMock).not.toHaveBeenCalled()
        expect(installDotAssetMock).not.toHaveBeenCalled()
    })
})
