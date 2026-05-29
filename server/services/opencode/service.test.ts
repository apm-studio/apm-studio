import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    appAgentsMock,
    authSetMock,
    fileListMock,
    fileStatusMock,
    findFilesMock,
    findSymbolsMock,
    findTextMock,
    globalDisposeMock,
    mcpConnectMock,
    mcpStatusMock,
    readGlobalConfigFileMock,
    readProjectConfigFileMock,
    writeGlobalConfigFileMock,
    invalidateMock,
    vcsGetMock,
} = vi.hoisted(() => ({
    appAgentsMock: vi.fn(),
    authSetMock: vi.fn(),
    fileListMock: vi.fn(),
    fileStatusMock: vi.fn(),
    findFilesMock: vi.fn(),
    findSymbolsMock: vi.fn(),
    findTextMock: vi.fn(),
    globalDisposeMock: vi.fn(),
    mcpConnectMock: vi.fn(),
    mcpStatusMock: vi.fn(),
    readGlobalConfigFileMock: vi.fn(),
    readProjectConfigFileMock: vi.fn(),
    writeGlobalConfigFileMock: vi.fn(),
    invalidateMock: vi.fn(),
    vcsGetMock: vi.fn(),
}))

vi.mock('../../lib/opencode.js', () => ({
    getOpencode: async () => ({
        app: {
            agents: appAgentsMock,
        },
        auth: {
            set: authSetMock,
        },
        config: {},
        file: {
            list: fileListMock,
            status: fileStatusMock,
        },
        find: {
            files: findFilesMock,
            symbols: findSymbolsMock,
            text: findTextMock,
        },
        vcs: {
            get: vcsGetMock,
        },
        global: {
            dispose: globalDisposeMock,
        },
        mcp: {
            connect: mcpConnectMock,
            status: mcpStatusMock,
        },
    }),
}))

vi.mock('../../lib/global-config.js', () => ({
    mergeOpenCodeConfig: (
        current: Record<string, unknown>,
        patch: Record<string, unknown>,
    ) => ({
        ...(Object.keys(current).length === 0 ? { $schema: 'https://opencode.ai/config.json' } : {}),
        ...current,
        ...patch,
        ...(patch.mcp && typeof patch.mcp === 'object' ? { mcp: patch.mcp } : {}),
        ...(patch.tools && typeof patch.tools === 'object' ? { tools: patch.tools } : {}),
    }),
    readGlobalConfigFile: readGlobalConfigFileMock,
    writeGlobalConfigFile: writeGlobalConfigFileMock,
}))

vi.mock('../../lib/opencode-sidecar.js', () => ({
    canRestartOpencodeSidecar: vi.fn(() => true),
    restartOpencodeSidecar: vi.fn(),
}))

vi.mock('../../lib/cache.js', () => ({
    invalidate: invalidateMock,
}))

vi.mock('../../lib/config.js', () => ({
    OPENCODE_URL: 'http://localhost:43202',
}))

vi.mock('../../lib/project-config.js', () => ({
    readProjectConfigFile: readProjectConfigFileMock,
    resolveProjectConfigPath: vi.fn(),
    writeProjectConfigFile: vi.fn(),
}))

vi.mock('../../lib/model-catalog.js', () => ({
    invalidateProviderListCache: vi.fn(),
}))

vi.mock('../../lib/opencode-auth.js', () => ({
    clearStoredProviderAuth: vi.fn(),
}))

describe('responseData', () => {
    it('preserves falsy OpenCode data values instead of replacing them with fallback values', async () => {
        const { responseData } = await import('./service.js')

        expect(responseData({ data: false }, true)).toBe(false)
        expect(responseData({ data: 0 }, 42)).toBe(0)
        expect(responseData({ data: '' }, 'fallback')).toBe('')
        expect(responseData({}, 'fallback')).toBe('fallback')
        expect(responseData({ data: null }, 'fallback')).toBe('fallback')
    })
})

describe('updateStudioMcpCatalog', () => {
    beforeEach(() => {
        vi.resetModules()
        readGlobalConfigFileMock.mockReset().mockResolvedValue({
            $schema: 'https://opencode.ai/config.json',
            mcp: {
                old: {
                    type: 'local',
                    command: ['old-mcp'],
                },
            },
            tools: {
                old_: true,
                'old_*': false,
                edit: true,
            },
        })
        writeGlobalConfigFileMock.mockReset().mockResolvedValue({})
        invalidateMock.mockReset()
    })

    it('saves MCP catalog changes into the Studio-owned config file', async () => {
        const { updateStudioMcpCatalog } = await import('./service.js')

        await updateStudioMcpCatalog({
            dartlab: {
                type: 'local',
                command: ['dartlab-mcp'],
            },
        })

        const expectedConfig = {
            $schema: 'https://opencode.ai/config.json',
            mcp: {
                dartlab: {
                    type: 'local',
                    command: ['dartlab-mcp'],
                },
            },
            tools: {
                old_: true,
                edit: true,
                'dartlab_*': false,
            },
        }
        expect(writeGlobalConfigFileMock).toHaveBeenCalledWith(expectedConfig, { dispose: false })
        expect(invalidateMock).toHaveBeenCalledWith('mcp-servers')
    })
})

describe('connectMcpServer', () => {
    beforeEach(() => {
        vi.resetModules()
        mcpConnectMock.mockReset().mockResolvedValue({ data: { ok: true } })
        mcpStatusMock.mockReset().mockResolvedValue({
            data: {
                dartlab: { status: 'connected' },
            },
        })
        readGlobalConfigFileMock.mockReset().mockResolvedValue({
            mcp: {
                dartlab: {
                    type: 'local',
                    command: ['dartlab-mcp'],
                },
            },
        })
        readProjectConfigFileMock.mockReset().mockResolvedValue({})
        invalidateMock.mockReset()
    })

    it('connects a saved Studio MCP server and verifies connected status', async () => {
        const { connectMcpServer } = await import('./service.js')

        await expect(connectMcpServer('/tmp/workspace', 'dartlab')).resolves.toEqual({ ok: true })

        expect(mcpConnectMock).toHaveBeenCalledWith({
            name: 'dartlab',
            directory: '/tmp/workspace',
        })
        expect(mcpStatusMock).toHaveBeenCalledWith({ directory: '/tmp/workspace' })
        expect(invalidateMock).toHaveBeenCalledWith('mcp-servers')
    })

    it('rejects undefined MCP servers before calling OpenCode connect', async () => {
        readGlobalConfigFileMock.mockResolvedValue({ mcp: {} })
        const { connectMcpServer } = await import('./service.js')

        await expect(connectMcpServer('/tmp/workspace', 'missing')).rejects.toThrow(
            "MCP server 'missing' is not defined in the Studio MCP library.",
        )

        expect(mcpConnectMock).not.toHaveBeenCalled()
    })

    it('rejects project-shadowed MCP servers before calling OpenCode connect', async () => {
        readProjectConfigFileMock.mockResolvedValue({
            mcp: {
                dartlab: {
                    type: 'local',
                    command: ['project-dartlab'],
                },
            },
        })
        const { connectMcpServer } = await import('./service.js')

        await expect(connectMcpServer('/tmp/workspace', 'dartlab')).rejects.toThrow(
            "MCP server 'dartlab' is shadowed by this workspace's project config.",
        )

        expect(mcpConnectMock).not.toHaveBeenCalled()
    })

    it('fails the connection test when OpenCode reports auth is required', async () => {
        mcpStatusMock.mockResolvedValue({
            data: {
                dartlab: { status: 'needs_auth' },
            },
        })
        const { connectMcpServer } = await import('./service.js')

        await expect(connectMcpServer('/tmp/workspace', 'dartlab')).rejects.toThrow(
            "MCP server 'dartlab' requires authentication before it can connect.",
        )
    })

    it('fails the connection test when OpenCode reports a failed status', async () => {
        mcpStatusMock.mockResolvedValue({
            data: {
                dartlab: { status: 'failed', error: 'spawn failed' },
            },
        })
        const { connectMcpServer } = await import('./service.js')

        await expect(connectMcpServer('/tmp/workspace', 'dartlab')).rejects.toThrow('spawn failed')
    })
})

describe('updateProviderAuth', () => {
    beforeEach(() => {
        vi.resetModules()
        authSetMock.mockReset().mockResolvedValue({ data: { provider: 'raw ignored' } })
        globalDisposeMock.mockReset().mockResolvedValue(undefined)
    })

    it('normalizes provider auth set responses to the Studio ok contract', async () => {
        const { updateProviderAuth } = await import('./service.js')

        await expect(updateProviderAuth('/tmp/workspace', 'openai', {
            type: 'api',
            key: 'test-key',
        })).resolves.toEqual({ ok: true })

        expect(authSetMock).toHaveBeenCalledWith({
            providerID: 'openai',
            auth: {
                type: 'api',
                key: 'test-key',
            },
        })
        expect(globalDisposeMock).toHaveBeenCalled()
    })
})

describe('OpenCode file and search summaries', () => {
    beforeEach(() => {
        vi.resetModules()
        appAgentsMock.mockReset()
        fileListMock.mockReset()
        fileStatusMock.mockReset()
        findFilesMock.mockReset()
        findTextMock.mockReset()
        findSymbolsMock.mockReset()
        vcsGetMock.mockReset()
    })

    it('normalizes file list entries to the Studio file contract', async () => {
        fileListMock.mockResolvedValueOnce({
            data: [
                {
                    name: 'App.tsx',
                    path: 'src/App.tsx',
                    type: 'file',
                    size: 123,
                    ignored: 'drop me',
                },
                { ignored: true },
            ],
        })
        const { listFiles } = await import('./service.js')

        await expect(listFiles('/tmp/workspace', 'src')).resolves.toEqual([
            {
                name: 'App.tsx',
                path: 'src/App.tsx',
                type: 'file',
                size: 123,
            },
        ])
    })

    it('normalizes search results to Studio search contracts', async () => {
        findFilesMock.mockResolvedValueOnce({
            data: ['src/App.tsx', '', { path: 'drop-me' }],
        })
        findTextMock.mockResolvedValueOnce({
            data: [
                { path: 'src/App.tsx', line: 10, column: 2, text: 'App', ignored: true },
            ],
        })
        findSymbolsMock.mockResolvedValueOnce({
            data: [
                { name: 'App', path: 'src/App.tsx', kind: 'component', line: 5, ignored: true },
            ],
        })
        const { findFilesInProject, findTextInProject, findSymbolsInProject } = await import('./service.js')

        await expect(findFilesInProject('/tmp/workspace', 'App')).resolves.toEqual(['src/App.tsx'])
        await expect(findTextInProject('/tmp/workspace', 'App')).resolves.toEqual([
            { path: 'src/App.tsx', line: 10, column: 2, text: 'App' },
        ])
        await expect(findSymbolsInProject('/tmp/workspace', 'App')).resolves.toEqual([
            { name: 'App', path: 'src/App.tsx', kind: 'component', line: 5 },
        ])
    })

    it('normalizes agents, file status, and vcs status to Studio contracts', async () => {
        appAgentsMock.mockResolvedValueOnce({
            data: [
                { name: 'build', mode: 'subagent', hidden: false, ignored: true },
                { id: 'fallback-name', mode: 'unknown-mode' },
                { mode: 'subagent' },
            ],
        })
        fileStatusMock.mockResolvedValueOnce({
            data: [
                { path: 'src/App.tsx', status: 'modified', added: 2, removed: 1, ignored: true },
                { path: 'src/Bad.tsx', status: 'unknown' },
            ],
        })
        vcsGetMock.mockResolvedValueOnce({
            data: { branch: 'main', dirty: true },
        })
        const { getFileStatus, getVcsStatus, listOpenCodeAgents } = await import('./service.js')

        await expect(listOpenCodeAgents('/tmp/workspace')).resolves.toEqual([
            { name: 'build', mode: 'subagent', hidden: false },
            { name: 'fallback-name' },
        ])
        await expect(getFileStatus('/tmp/workspace')).resolves.toEqual([
            { path: 'src/App.tsx', status: 'modified', added: 2, removed: 1 },
        ])
        await expect(getVcsStatus('/tmp/workspace')).resolves.toEqual({ branch: 'main' })
    })
})
