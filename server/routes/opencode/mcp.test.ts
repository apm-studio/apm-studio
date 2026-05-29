import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServerListResponse } from '../../../shared/opencode-contracts.js'

const opencodeServiceMock = vi.hoisted(() => ({
    authenticateMcp: vi.fn(),
    completeMcpAuth: vi.fn(),
    connectMcpServer: vi.fn(),
    getStudioMcpCatalog: vi.fn(),
    listMcpServers: vi.fn(),
    removeMcpAuth: vi.fn(),
    startMcpAuth: vi.fn(),
    updateStudioMcpCatalog: vi.fn(),
}))

vi.mock('../../services/opencode/service.js', () => opencodeServiceMock)

describe('opencode MCP routes', () => {
    beforeEach(() => {
        Object.values(opencodeServiceMock).forEach((mock) => mock.mockReset())
    })

    it('wraps MCP server summaries in the shared list response contract', async () => {
        opencodeServiceMock.listMcpServers.mockResolvedValueOnce([
            { name: 'github', status: 'connected', tools: [], resources: [] },
        ])
        const { default: opencodeMcp } = await import('./mcp.js')

        const res = await opencodeMcp.request('http://studio.local/api/mcp/servers?refresh=1&workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json() as McpServerListResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({
            servers: [
                { name: 'github', status: 'connected', tools: [], resources: [] },
            ],
        })
        expect(opencodeServiceMock.listMcpServers).toHaveBeenCalledWith('/tmp/workspace')
    })

    it('uses the MCP list response contract for recoverable list failures', async () => {
        opencodeServiceMock.listMcpServers.mockRejectedValueOnce(new Error('mcp unavailable'))
        const { default: opencodeMcp } = await import('./mcp.js')

        const res = await opencodeMcp.request('http://studio.local/api/mcp/servers?refresh=1')
        const body = await res.json() as McpServerListResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({ servers: [] })
    })

    it('returns Studio ok contracts for MCP mutations', async () => {
        opencodeServiceMock.connectMcpServer.mockResolvedValueOnce({ ok: true })
        opencodeServiceMock.completeMcpAuth.mockResolvedValueOnce({ ok: true })
        opencodeServiceMock.authenticateMcp.mockResolvedValueOnce({ ok: true })
        opencodeServiceMock.removeMcpAuth.mockResolvedValueOnce({ ok: true })
        const { default: opencodeMcp } = await import('./mcp.js')

        const connectRes = await opencodeMcp.request('http://studio.local/api/mcp/github/connect?workingDir=%2Ftmp%2Fworkspace', { method: 'POST' })
        const callbackRes = await opencodeMcp.request('http://studio.local/api/mcp/github/auth/callback?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: 'oauth-code' }),
        })
        const authenticateRes = await opencodeMcp.request('http://studio.local/api/mcp/github/auth/authenticate?workingDir=%2Ftmp%2Fworkspace', { method: 'POST' })
        const removeRes = await opencodeMcp.request('http://studio.local/api/mcp/github/auth?workingDir=%2Ftmp%2Fworkspace', { method: 'DELETE' })

        await expect(connectRes.json()).resolves.toEqual({ ok: true })
        await expect(callbackRes.json()).resolves.toEqual({ ok: true })
        await expect(authenticateRes.json()).resolves.toEqual({ ok: true })
        await expect(removeRes.json()).resolves.toEqual({ ok: true })
        expect(opencodeServiceMock.connectMcpServer).toHaveBeenCalledWith('/tmp/workspace', 'github')
        expect(opencodeServiceMock.completeMcpAuth).toHaveBeenCalledWith('/tmp/workspace', 'github', 'oauth-code')
        expect(opencodeServiceMock.authenticateMcp).toHaveBeenCalledWith('/tmp/workspace', 'github')
        expect(opencodeServiceMock.removeMcpAuth).toHaveBeenCalledWith('/tmp/workspace', 'github')
    })

    it('returns MCP auth start through the explicit authorization URL contract', async () => {
        opencodeServiceMock.startMcpAuth.mockResolvedValueOnce({
            authorizationUrl: 'https://provider.example/oauth',
        })
        const { default: opencodeMcp } = await import('./mcp.js')

        const res = await opencodeMcp.request('http://studio.local/api/mcp/github/auth/start?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
        })

        await expect(res.json()).resolves.toEqual({
            authorizationUrl: 'https://provider.example/oauth',
        })
        expect(opencodeServiceMock.startMcpAuth).toHaveBeenCalledWith('/tmp/workspace', 'github')
    })
})
