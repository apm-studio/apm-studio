import { Hono } from 'hono'
import type { ProviderAuthMethodMap } from '../../../shared/provider-auth.js'
import type {
    OpenCodeAgentListResponse,
    OpenCodeConfig,
    OpenCodeConfigUpdateRequest,
    OpenCodeConfigUpdateResponse,
    OpenCodeHealthResponse,
    OpenCodeProjectConfigResponse,
    OpenCodeRestartResponse,
    OpenCodeRuntimeApplyResponse,
    ProviderListResponse,
    RuntimeModelListResponse,
    RuntimeToolResolveRequest,
    RuntimeToolResolution,
    TerminalShellListResponse,
    VcsStatusResponse,
} from '../../../shared/opencode-contracts.js'
import { resolveRuntimeTools } from '../../lib/runtime-tools.js'
import { jsonOpencodeError } from '../../lib/opencode-errors.js'
import { listRuntimeModels, listProviderSummaries } from '../../lib/model-catalog.js'
import {
    getGlobalOpenCodeConfig,
    getOpenCodeHealth,
    getOpenCodeUnavailableHealth,
    getProviderAuthMethods,
    getVcsStatus,
    listTerminalShells,
    listOpenCodeAgents,
    readProjectConfigSnapshot,
    restartManagedOpenCode,
    updateGlobalOpenCodeConfig,
    updateProjectOpenCodeConfig,
} from '../../services/opencode/service.js'
import { applyStudioRuntimeReload } from '../../services/runtime/reload-service.js'
import { requestWorkingDir } from '../route-errors.js'

const opencodeCore = new Hono()

function toError(error: unknown) {
    return error instanceof Error ? error : new Error('OpenCode is unavailable')
}

opencodeCore.get('/api/opencode/health', async (c) => {
    try {
        const response = await getOpenCodeHealth(requestWorkingDir(c))
        return c.json(response satisfies OpenCodeHealthResponse)
    } catch (error: unknown) {
        const response = getOpenCodeUnavailableHealth(toError(error))
        return c.json(response satisfies OpenCodeHealthResponse, 503)
    }
})

opencodeCore.post('/api/opencode/restart', async (c) => {
    try {
        const response = await restartManagedOpenCode()
        return c.json(response satisfies OpenCodeRestartResponse)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 400 })
    }
})

opencodeCore.post('/api/opencode/runtime/apply', async (c) => {
    try {
        const response = await applyStudioRuntimeReload(requestWorkingDir(c))
        return c.json(response satisfies OpenCodeRuntimeApplyResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/opencode/terminal/shells', async (c) => {
    try {
        const response: TerminalShellListResponse = {
            shells: await listTerminalShells(requestWorkingDir(c)),
        }
        return c.json(response)
    } catch {
        return c.json({ shells: [] } satisfies TerminalShellListResponse)
    }
})

opencodeCore.get('/api/models', async (c) => {
    try {
        const response: RuntimeModelListResponse = {
            models: await listRuntimeModels(requestWorkingDir(c)),
        }
        return c.json(response)
    } catch {
        return c.json({ models: [] } satisfies RuntimeModelListResponse)
    }
})

opencodeCore.get('/api/providers', async (c) => {
    try {
        const response: ProviderListResponse = {
            providers: await listProviderSummaries(requestWorkingDir(c)),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

opencodeCore.get('/api/agents', async (c) => {
    try {
        const response: OpenCodeAgentListResponse = {
            agents: await listOpenCodeAgents(requestWorkingDir(c)),
        }
        return c.json(response)
    } catch {
        return c.json({ agents: [] } satisfies OpenCodeAgentListResponse)
    }
})

opencodeCore.post('/api/runtime/tools', async (c) => {
    const { model = null, mcpServerNames = [] } = await c.req.json<RuntimeToolResolveRequest>()
    try {
        const response: RuntimeToolResolution = await resolveRuntimeTools(
            requestWorkingDir(c),
            model,
            mcpServerNames,
        )
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/config', async (c) => {
    try {
        const response = await getGlobalOpenCodeConfig()
        return c.json(response satisfies OpenCodeConfig)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/config/project', async (c) => {
    const response = await readProjectConfigSnapshot(requestWorkingDir(c))
    return c.json(response satisfies OpenCodeProjectConfigResponse)
})

opencodeCore.put('/api/config', async (c) => {
    const body = await c.req.json<OpenCodeConfigUpdateRequest>()
    try {
        const response = await updateGlobalOpenCodeConfig(body)
        return c.json(response satisfies OpenCodeConfigUpdateResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.put('/api/config/project', async (c) => {
    const body = await c.req.json<OpenCodeConfigUpdateRequest>()
    try {
        const response = await updateProjectOpenCodeConfig(requestWorkingDir(c), body)
        return c.json(response satisfies OpenCodeConfigUpdateResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeCore.get('/api/provider/auth', async (c) => {
    try {
        const response: ProviderAuthMethodMap = await getProviderAuthMethods(requestWorkingDir(c))
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err, { defaultStatus: 503 })
    }
})

opencodeCore.get('/api/vcs', async (c) => {
    try {
        const response = await getVcsStatus(requestWorkingDir(c))
        return c.json(response satisfies VcsStatusResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default opencodeCore
