import type { McpCatalog, McpEntryConfig } from '../../shared/mcp-catalog.js'
import type { McpServerSummary } from '../../shared/opencode-contracts.js'
import { extractMcpCatalog, mcpEntryType, mcpServerNamesFromConfig } from '../../shared/mcp-catalog.js'
import { readGlobalConfigFile } from './global-config.js'
import { readProjectConfigFile } from './project-config.js'

export type McpLiveStatusEntry = {
    status?: string
    tools?: Array<{ name?: string } | Record<string, unknown>>
    resources?: unknown[]
    error?: string
}

export type McpLiveStatusMap = Record<string, McpLiveStatusEntry>
type McpServerStatus = McpServerSummary['status']

function normalizeMcpStatus(status: string | undefined): McpServerStatus {
    switch (status) {
        case 'connected':
        case 'disconnected':
        case 'disabled':
        case 'failed':
        case 'needs_auth':
        case 'needs_client_registration':
        case 'unknown':
            return status
        default:
            return 'disconnected'
    }
}

function summarizeMcpTools(tools: McpLiveStatusEntry['tools'] = []): McpServerSummary['tools'] {
    return tools
        .map((tool) => {
            const record = tool as Record<string, unknown>
            const name = typeof record.name === 'string' ? record.name : ''
            if (!name) {
                return null
            }
            const description = typeof record.description === 'string' ? record.description : undefined
            return description ? { name, description } : { name }
        })
        .filter((tool): tool is McpServerSummary['tools'][number] => !!tool)
}

export async function readGlobalMcpCatalog(): Promise<McpCatalog> {
    const config = await readGlobalConfigFile()
    return extractMcpCatalog(config)
}

export async function readProjectMcpServerNames(cwd: string): Promise<string[]> {
    const config = await readProjectConfigFile(cwd)
    return mcpServerNamesFromConfig(config)
}

export function summarizeMcpCatalog(
    catalog: McpCatalog,
    liveStatus: McpLiveStatusMap,
    shadowedServerNames: Iterable<string> = [],
): McpServerSummary[] {
    const shadowed = new Set(shadowedServerNames)
    return Object.keys(catalog)
        .sort((left, right) => left.localeCompare(right))
        .map((name) => {
            const config = catalog[name] as McpEntryConfig | undefined
            const live = liveStatus[name]
            const isShadowed = shadowed.has(name)
            const startupDisabled = config?.enabled === false
            const status: McpServerStatus = isShadowed
                ? 'failed'
                : live?.status === 'connected'
                    ? 'connected'
                    : startupDisabled
                        ? 'disabled'
                        : normalizeMcpStatus(live?.status)
            const oauthConfig = config && config.type === 'remote'
                ? config.oauth
                : undefined

            return {
                name,
                status,
                tools: summarizeMcpTools(live?.tools),
                resources: live?.resources || [],
                defined: true,
                configType: mcpEntryType(config),
                authStatus: status === 'needs_auth' ? 'needs_auth' : status === 'connected' ? 'ready' : 'n/a',
                error: isShadowed
                    ? 'This workspace defines a project MCP with the same name. Studio only manages global MCP servers, so the project-level override is ignored here.'
                    : (typeof live?.error === 'string' ? live.error : undefined),
                oauthConfigured: !!(
                    oauthConfig
                    && typeof oauthConfig === 'object'
                    && (oauthConfig.clientId || oauthConfig.clientSecret || oauthConfig.scope)
                ),
                clientRegistrationRequired: status === 'needs_client_registration',
            }
        })
}
