import { getOpencode } from '../../lib/opencode.js'
import { invalidate } from '../../lib/cache.js'
import { StudioValidationError, unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { mergeOpenCodeConfig, readGlobalConfigFile, writeGlobalConfigFile } from '../../lib/global-config.js'
import { readGlobalMcpCatalog, readProjectMcpServerNames, summarizeMcpCatalog } from '../../lib/mcp-catalog.js'
import type { McpLiveStatusMap } from '../../lib/mcp-catalog.js'
import {
    extractMcpCatalog,
    isMcpCatalog,
    mergeMcpToolOverrides,
    type McpCatalog,
} from '../../../shared/mcp-catalog.js'
import type {
    McpAuthStartResponse,
    McpMutationResponse,
    McpServerSummary,
} from '../../../shared/opencode-contracts.js'
import { responseData } from './response-data.js'

export async function getStudioMcpCatalog() {
    return readGlobalMcpCatalog()
}

export async function updateStudioMcpCatalog(catalog: unknown): Promise<McpCatalog> {
    if (!isMcpCatalog(catalog)) {
        throw new StudioValidationError('Invalid MCP catalog payload.')
    }

    const current = await readGlobalConfigFile()
    const previousCatalog = extractMcpCatalog(current)
    const nextTools = mergeMcpToolOverrides(
        current.tools && typeof current.tools === 'object'
            ? current.tools as Record<string, unknown>
            : {},
        previousCatalog,
        catalog,
    )
    const nextConfig = mergeOpenCodeConfig(current, {
        mcp: catalog,
        tools: nextTools,
    })

    await writeGlobalConfigFile(nextConfig, { dispose: false })
    invalidate('mcp-servers')
    return catalog
}

export async function listMcpServers(directory: string): Promise<McpServerSummary[]> {
    return cachedMcpServers(directory)
}

async function cachedMcpServers(cwd: string): Promise<McpServerSummary[]> {
    const oc = await getOpencode()
    const res = await oc.mcp.status({ directory: cwd })
    const data = responseData<McpLiveStatusMap>(res, {})
    const catalog = await readGlobalMcpCatalog()
    const shadowedServerNames = await readProjectMcpServerNames(cwd)
    return summarizeMcpCatalog(catalog, data, shadowedServerNames)
}

export async function startMcpAuth(directory: string, name: string): Promise<McpAuthStartResponse> {
    await validateMcpAuthRequest(directory, name)
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<unknown>(await oc.mcp.auth.start({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    const authorizationUrl = data && typeof data === 'object'
        ? (data as { authorizationUrl?: unknown }).authorizationUrl
        : null
    if (typeof authorizationUrl !== 'string' || !authorizationUrl.trim()) {
        throw new StudioValidationError('MCP auth start response did not include an authorization URL.', 'fix_input', 500)
    }
    return { authorizationUrl }
}

export async function completeMcpAuth(directory: string, name: string, code: string): Promise<McpMutationResponse> {
    const oc = await getOpencode()
    unwrapOpencodeResult<unknown>(await oc.mcp.auth.callback({
        name,
        directory,
        code,
    }))
    invalidate('mcp-servers')
    return { ok: true }
}

export async function authenticateMcp(directory: string, name: string): Promise<McpMutationResponse> {
    await validateMcpAuthRequest(directory, name)
    const oc = await getOpencode()
    unwrapOpencodeResult<unknown>(await oc.mcp.auth.authenticate({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    return { ok: true }
}

export async function removeMcpAuth(directory: string, name: string): Promise<McpMutationResponse> {
    const oc = await getOpencode()
    unwrapOpencodeResult<unknown>(await oc.mcp.auth.remove({
        name,
        directory,
    }))
    invalidate('mcp-servers')
    return { ok: true }
}

export async function runMcpMutation(
    _directory: string,
    action: (oc: Awaited<ReturnType<typeof getOpencode>>) => Promise<unknown>,
): Promise<McpMutationResponse> {
    const oc = await getOpencode()
    unwrapOpencodeResult<unknown>(await action(oc))
    invalidate('mcp-servers')
    return { ok: true }
}

export async function connectMcpServer(directory: string, name: string): Promise<McpMutationResponse> {
    await validateStudioManagedMcpServer(directory, name)
    const result = await runMcpMutation(directory, (oc) => oc.mcp.connect({
        name,
        directory,
    }))
    await verifyMcpConnection(directory, name)
    return result
}

export async function validateMcpAuthRequest(directory: string, name: string) {
    const config = await validateStudioManagedMcpServer(directory, name)

    if (!('type' in config) || config.type !== 'remote') {
        throw new StudioValidationError(`MCP server '${name}' does not support OAuth authentication.`, 'fix_input', 400)
    }

    if (config.oauth === false) {
        throw new StudioValidationError(`MCP server '${name}' does not support OAuth authentication.`, 'fix_input', 400)
    }
}

async function validateStudioManagedMcpServer(directory: string, name: string) {
    const [catalog, projectMcpServerNames] = await Promise.all([
        readGlobalMcpCatalog(),
        readProjectMcpServerNames(directory),
    ])
    const config = catalog[name]

    if (!config) {
        throw new StudioValidationError(`MCP server '${name}' is not defined in the Studio MCP library.`, 'fix_input', 404)
    }

    const projectMcpNames = new Set(projectMcpServerNames)
    if (projectMcpNames.has(name)) {
        throw new StudioValidationError(
            `MCP server '${name}' is shadowed by this workspace's project config. Studio only manages global MCP servers.`,
            'fix_input',
            409,
        )
    }

    return config
}

async function verifyMcpConnection(directory: string, name: string) {
    const oc = await getOpencode()
    const status = responseData<McpLiveStatusMap>(await oc.mcp.status({ directory }), {})
    const current = status[name]

    if (current?.status === 'connected') {
        return
    }

    if (!current?.status || current.status === 'disconnected' || current.status === 'unknown') {
        // OpenCode can return an empty/unknown status map even after a successful
        // connect call for globally configured MCP servers. Treat the mutation
        // success as the best available signal in that case.
        return
    }

    if (current.status === 'needs_auth') {
        throw new StudioValidationError(`MCP server '${name}' requires authentication before it can connect.`, 'fix_input', 409)
    }

    if (current.status === 'needs_client_registration') {
        throw new StudioValidationError(
            current.error || `MCP server '${name}' requires OAuth client registration before it can connect.`,
            'fix_input',
            409,
        )
    }

    throw new StudioValidationError(
        current.error || `MCP server '${name}' did not reach connected state.`,
        'retry',
        503,
    )
}
