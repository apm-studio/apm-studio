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

const DEFAULT_REGISTRY_URL = 'https://apm-registry.dance-of-tal.workers.dev'

type CatalogQuery = {
    q?: string
    kind?: RegistryListingKind
    target?: RegistryTargetId
    tag?: string
    limit?: number
    cursor?: string
}

function registryBaseUrl() {
    return (process.env.APM_STUDIO_REGISTRY_URL || DEFAULT_REGISTRY_URL).replace(/\/+$/, '')
}

function registryUrl(pathname: string, params?: Record<string, string | number | undefined>) {
    const url = new URL(`${registryBaseUrl()}${pathname}`)
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && `${value}`.trim()) {
            url.searchParams.set(key, `${value}`)
        }
    })
    return url
}

async function fetchJson<T>(url: URL): Promise<T> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`APM Registry request failed with HTTP ${response.status}.`)
    }
    return await response.json() as T
}

export async function searchImportCatalog(query: CatalogQuery): Promise<RegistryCatalogResponse> {
    return fetchJson<RegistryCatalogResponse>(registryUrl('/v1/catalog', {
        q: query.q,
        kind: query.kind,
        target: query.target,
        tag: query.tag,
        limit: query.limit || 20,
        cursor: query.cursor,
    }))
}

function registryEventHeaders() {
    const token = process.env.APM_STUDIO_REGISTRY_EVENT_TOKEN?.trim()
    return {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
    }
}

async function postRegistryJson<T>(pathname: string, body: unknown): Promise<T> {
    const response = await fetch(registryUrl(pathname), {
        method: 'POST',
        headers: registryEventHeaders(),
        body: JSON.stringify(body),
    })
    if (!response.ok) {
        throw new Error(`APM Registry request failed with HTTP ${response.status}.`)
    }
    return await response.json() as T
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
