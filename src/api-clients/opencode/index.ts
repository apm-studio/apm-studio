import type { McpCatalog } from '../../../shared/mcp-catalog'
import type {
    ProviderAuthInput,
    ProviderAuthMethodMap,
    ProviderOauthAuthorization,
    ProviderOauthAuthorizeRequest,
    ProviderOauthCallbackRequest,
} from '../../../shared/provider-auth'
import type {
    FileListResponse,
    FileStatusResponse,
    FindFilesResponse,
    FindSymbolsResponse,
    FindTextResponse,
    McpAuthStartResponse,
    McpMutationResponse,
    McpServerListResponse,
    OpenCodeConfig,
    OpenCodeConfigUpdateRequest,
    OpenCodeConfigUpdateResponse,
    OpenCodeAgentListResponse,
    OpenCodeFileReadResponse,
    OpenCodeHealthResponse,
    OpenCodeProjectConfigResponse,
    OpenCodeRestartResponse,
    OpenCodeRuntimeApplyResponse,
    ProviderListResponse,
    ProviderAuthClearResponse,
    ProviderAuthStatusResponse,
    RuntimeModelListResponse,
    RuntimeToolResolveRequest,
    RuntimeToolResolution,
    TerminalShellListResponse,
    UsageResponse,
    VcsStatusResponse,
} from '../../../shared/opencode-contracts'
import { deleteJSON, fetchJSON, postJSON, putJSON } from '../../api-core'

export const opencodeApi = {
    health: () =>
        fetchJSON<OpenCodeHealthResponse>('/api/opencode/health'),

    restart: () =>
        postJSON<OpenCodeRestartResponse>('/api/opencode/restart'),

    applyRuntimeReload: () =>
        postJSON<OpenCodeRuntimeApplyResponse>('/api/opencode/runtime/apply'),

    terminal: {
        shells: () => fetchJSON<TerminalShellListResponse>('/api/opencode/terminal/shells')
            .then((response) => response.shells),
    },

    mcp: {
        getCatalog: () => fetchJSON<McpCatalog>('/api/mcp/catalog'),
        updateCatalog: (catalog: McpCatalog) => putJSON<McpCatalog>('/api/mcp/catalog', catalog),
        list: (options?: { refresh?: boolean }) =>
            fetchJSON<McpServerListResponse>(`/api/mcp/servers${options?.refresh ? '?refresh=1' : ''}`)
                .then((response) => response.servers),
        authStart: (name: string) => postJSON<McpAuthStartResponse>(`/api/mcp/${name}/auth/start`),
        authCallback: (name: string, code: string) => postJSON<McpMutationResponse>(`/api/mcp/${name}/auth/callback`, { code }),
        authenticate: (name: string) => postJSON<McpMutationResponse>(`/api/mcp/${name}/auth/authenticate`),
        clearAuth: (name: string) => deleteJSON<McpMutationResponse>(`/api/mcp/${name}/auth`),
        connect: (name: string) => postJSON<McpMutationResponse>(`/api/mcp/${name}/connect`),
    },

    models: {
        list: () => fetchJSON<RuntimeModelListResponse>('/api/models')
            .then((response) => response.models),
    },

    agents: {
        list: () => fetchJSON<OpenCodeAgentListResponse>('/api/agents')
            .then((response) => response.agents),
    },

    runtime: {
        resolveTools: (payload: RuntimeToolResolveRequest) =>
            fetchJSON<RuntimeToolResolution>('/api/runtime/tools', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),
    },

    config: {
        getGlobal: () => fetchJSON<OpenCodeConfig>('/api/config'),
        updateGlobal: (config: OpenCodeConfigUpdateRequest) => putJSON<OpenCodeConfigUpdateResponse>('/api/config', config),
        getProject: () => fetchJSON<OpenCodeProjectConfigResponse>('/api/config/project'),
        updateProject: (config: OpenCodeConfigUpdateRequest) => putJSON<OpenCodeConfigUpdateResponse>('/api/config/project', config),
    },

    providers: {
        list: () => fetchJSON<ProviderListResponse>('/api/providers')
            .then((response) => response.providers),
    },

    provider: {
        authMethods: () => fetchJSON<ProviderAuthMethodMap>('/api/provider/auth'),
        oauthAuthorize: (providerId: string, method: number, inputs?: Record<string, string>) =>
            postJSON<ProviderOauthAuthorization>(
                `/api/provider/${providerId}/oauth/authorize`,
                (inputs ? { method, inputs } : { method }) satisfies ProviderOauthAuthorizeRequest,
            ),
        oauthCallback: (providerId: string, method: number, code?: string) =>
            postJSON<ProviderOauthAuthorization>(
                `/api/provider/${providerId}/oauth/callback`,
                (code ? { method, code } : { method }) satisfies ProviderOauthCallbackRequest,
            ),
        setAuth: (
            providerId: string,
            auth: ProviderAuthInput,
        ) => putJSON<ProviderAuthStatusResponse>(`/api/provider/${providerId}/auth`, auth),
        clearAuth: (providerId: string) => deleteJSON<ProviderAuthClearResponse>(`/api/provider/${providerId}/auth`),
    },

    file: {
        list: (path = '.') => fetchJSON<FileListResponse>(`/api/file/list?path=${encodeURIComponent(path)}`)
            .then((response) => response.entries),
        read: (path: string) => fetchJSON<OpenCodeFileReadResponse>(`/api/file/read?path=${encodeURIComponent(path)}`),
        status: () => fetchJSON<FileStatusResponse>('/api/file/status')
            .then((response) => response.files),
    },

    find: {
        text: (pattern: string) => fetchJSON<FindTextResponse>(`/api/find/text?pattern=${encodeURIComponent(pattern)}`)
            .then((response) => response.matches),
        files: (pattern: string) => fetchJSON<FindFilesResponse>(`/api/find/files?pattern=${encodeURIComponent(pattern)}`)
            .then((response) => response.files),
        symbols: (pattern: string) => fetchJSON<FindSymbolsResponse>(`/api/find/symbols?pattern=${encodeURIComponent(pattern)}`)
            .then((response) => response.symbols),
    },

    vcs: {
        get: () => fetchJSON<VcsStatusResponse>('/api/vcs'),
    },

    usage: {
        get: () => fetchJSON<UsageResponse>('/api/usage'),
    },
}
