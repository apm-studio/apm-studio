import type {
    RegistryCatalogResponse,
    RegistryDownloadEventRequest,
    RegistryDownloadEventResponse,
    RegistryListingKind,
    RegistryTargetId,
} from '../../../shared/registry-contracts.js'
import type {
    ApmGitHubImportRequest,
    ApmGitHubImportResponse,
} from '../../../shared/apm-contracts.js'

const DEFAULT_REGISTRY_URL = 'https://registry.apm.studio'
const TRANSITION_REGISTRY_URL = 'https://apm-registry.dance-of-tal.workers.dev'

type CatalogQuery = {
    q?: string
    kind?: RegistryListingKind
    target?: RegistryTargetId
    tag?: string
    limit?: number
    cursor?: string
}

function cleanRegistryUrl(value: string) {
    return value.replace(/\/+$/, '')
}

function registryBaseUrls() {
    const override = process.env.APM_STUDIO_REGISTRY_URL?.trim()
    if (override) return [cleanRegistryUrl(override)]
    return [DEFAULT_REGISTRY_URL, TRANSITION_REGISTRY_URL].map(cleanRegistryUrl)
}

function registryUrl(baseUrl: string, pathname: string, params?: Record<string, string | number | undefined>) {
    const url = new URL(`${baseUrl}${pathname}`)
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && `${value}`.trim()) {
            url.searchParams.set(key, `${value}`)
        }
    })
    return url
}

async function fetchJson<T>(pathname: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const urls = registryBaseUrls().map((baseUrl) => registryUrl(baseUrl, pathname, params))
    let lastError: unknown
    for (const url of urls) {
        try {
            return await fetchRegistryJson<T>(url)
        } catch (error) {
            lastError = error
        }
    }
    throw lastError instanceof Error ? lastError : new Error('APM Registry request failed.')
}

async function fetchRegistryJson<T>(url: URL): Promise<T> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`APM Registry request failed with HTTP ${response.status}.`)
    }
    return await response.json() as T
}

export async function searchImportCatalog(query: CatalogQuery): Promise<RegistryCatalogResponse> {
    return fetchJson<RegistryCatalogResponse>('/v1/catalog', {
        q: query.q,
        kind: query.kind,
        target: query.target,
        tag: query.tag,
        limit: query.limit || 20,
        cursor: query.cursor,
    })
}

function registryEventHeaders() {
    const token = process.env.APM_STUDIO_REGISTRY_EVENT_TOKEN?.trim()
    return {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
    }
}

async function postRegistryJson<T>(pathname: string, body: unknown): Promise<T> {
    const urls = registryBaseUrls().map((baseUrl) => registryUrl(baseUrl, pathname))
    let lastError: unknown
    for (const url of urls) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: registryEventHeaders(),
                body: JSON.stringify(body),
            })
            if (!response.ok) {
                throw new Error(`APM Registry request failed with HTTP ${response.status}.`)
            }
            return await response.json() as T
        } catch (error) {
            lastError = error
        }
    }
    throw lastError instanceof Error ? lastError : new Error('APM Registry request failed.')
}

export async function recordImportCatalogDownload(
    request: ApmGitHubImportRequest,
    response: ApmGitHubImportResponse,
): Promise<void> {
    if (!request.registryListingId) return
    const event: RegistryDownloadEventRequest = {
        listingId: request.registryListingId,
        source: {
            type: 'github',
            repo: response.source.repo,
            ref: response.source.ref,
            ...(response.source.subpath ? { path: response.source.subpath } : {}),
        },
        ...(request.format && request.format !== 'auto' ? {
            importRecipe: {
                format: request.format,
                adapter: `${request.format}@studio-import`,
            },
        } : {}),
    }
    await postRegistryJson<RegistryDownloadEventResponse>('/v1/downloads', event)
}
