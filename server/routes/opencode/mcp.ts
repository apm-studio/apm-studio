import { Hono } from 'hono'
import type { McpCatalog } from '../../../shared/mcp-catalog.js'
import type {
    McpAuthCallbackRequest,
    McpAuthStartResponse,
    McpMutationResponse,
    McpServerListResponse,
} from '../../../shared/opencode-contracts.js'
import { cached, TTL } from '../../lib/cache.js'
import { jsonOpencodeError } from '../../lib/opencode-errors.js'
import {
    authenticateMcp,
    completeMcpAuth,
    connectMcpServer,
    getStudioMcpCatalog,
    listMcpServers,
    removeMcpAuth,
    startMcpAuth,
    updateStudioMcpCatalog,
} from '../../services/opencode/service.js'
import { requestWorkingDir } from '../route-errors.js'

const opencodeMcp = new Hono()

opencodeMcp.get('/api/mcp/catalog', async (c) => {
    try {
        const response = await getStudioMcpCatalog()
        return c.json(response satisfies McpCatalog)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeMcp.put('/api/mcp/catalog', async (c) => {
    const body = await c.req.json<McpCatalog>().catch(() => ({}))
    try {
        const response = await updateStudioMcpCatalog(body)
        return c.json(response satisfies McpCatalog)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeMcp.get('/api/mcp/servers', async (c) => {
    try {
        const cwd = requestWorkingDir(c)
        if (c.req.query('refresh') === '1') {
            const response: McpServerListResponse = {
                servers: await listMcpServers(cwd),
            }
            return c.json(response)
        }
        const response: McpServerListResponse = {
            servers: await cached(`mcp-servers-${cwd}`, TTL.MCP_SERVERS, async () => listMcpServers(cwd)),
        }
        return c.json(response)
    } catch {
        return c.json({ servers: [] } satisfies McpServerListResponse)
    }
})

opencodeMcp.post('/api/mcp/:name/connect', async (c) => {
    try {
        const response = await connectMcpServer(requestWorkingDir(c), c.req.param('name'))
        return c.json(response satisfies McpMutationResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeMcp.post('/api/mcp/:name/auth/start', async (c) => {
    try {
        const response = await startMcpAuth(requestWorkingDir(c), c.req.param('name'))
        return c.json(response satisfies McpAuthStartResponse)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.post('/api/mcp/:name/auth/callback', async (c) => {
    const { code } = await c.req.json<McpAuthCallbackRequest>().catch(() => ({ code: '' }))
    try {
        const response = await completeMcpAuth(requestWorkingDir(c), c.req.param('name'), code)
        return c.json(response satisfies McpMutationResponse)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.post('/api/mcp/:name/auth/authenticate', async (c) => {
    try {
        const response = await authenticateMcp(requestWorkingDir(c), c.req.param('name'))
        return c.json(response satisfies McpMutationResponse)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

opencodeMcp.delete('/api/mcp/:name/auth', async (c) => {
    try {
        const response = await removeMcpAuth(requestWorkingDir(c), c.req.param('name'))
        return c.json(response satisfies McpMutationResponse)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 500 })
    }
})

export default opencodeMcp
