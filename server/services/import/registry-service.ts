import type {
    RegistryCatalogResponse,
    RegistryListingKind,
    RegistryTargetId,
} from '../../../shared/registry-contracts.js'

const DEFAULT_REGISTRY_URL = 'https://registry.apm.studio'

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
