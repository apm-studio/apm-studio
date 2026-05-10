import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    mcpConnectMock,
    mcpStatusMock,
    readGlobalConfigFileMock,
    readProjectConfigFileMock,
    writeGlobalConfigFileMock,
    invalidateMock,
} = vi.hoisted(() => ({
    mcpConnectMock: vi.fn(),
    mcpStatusMock: vi.fn(),
    readGlobalConfigFileMock: vi.fn(),
    readProjectConfigFileMock: vi.fn(),
    writeGlobalConfigFileMock: vi.fn(),
    invalidateMock: vi.fn(),
}))

vi.mock('../lib/opencode.js', () => ({
    getOpencode: async () => ({
        config: {},
        mcp: {
            connect: mcpConnectMock,
            status: mcpStatusMock,
        },
    }),
}))

vi.mock('../lib/global-config.js', () => ({
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

vi.mock('../lib/opencode-sidecar.js', () => ({
    canRestartOpencodeSidecar: vi.fn(() => true),
    restartOpencodeSidecar: vi.fn(),
}))

vi.mock('../lib/cache.js', () => ({
    invalidate: invalidateMock,
}))

vi.mock('../lib/config.js', () => ({
    OPENCODE_URL: 'http://localhost:43202',
}))

vi.mock('../lib/project-config.js', () => ({
    readProjectConfigFile: readProjectConfigFileMock,
    resolveProjectConfigPath: vi.fn(),
    writeProjectConfigFile: vi.fn(),
}))

vi.mock('../lib/model-catalog.js', () => ({
    invalidateProviderListCache: vi.fn(),
}))

vi.mock('../lib/opencode-auth.js', () => ({
    clearStoredProviderAuth: vi.fn(),
}))

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
        const { updateStudioMcpCatalog } = await import('./opencode-service.js')

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
        const { connectMcpServer } = await import('./opencode-service.js')

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
        const { connectMcpServer } = await import('./opencode-service.js')

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
        const { connectMcpServer } = await import('./opencode-service.js')

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
        const { connectMcpServer } = await import('./opencode-service.js')

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
        const { connectMcpServer } = await import('./opencode-service.js')

        await expect(connectMcpServer('/tmp/workspace', 'dartlab')).rejects.toThrow('spawn failed')
    })
})
