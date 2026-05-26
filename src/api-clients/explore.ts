import type {
    RegistryCatalogResponse,
    RegistryImportListingResponse,
    RegistryListingKind,
    RegistryListingResponse,
    RegistryPresetListResponse,
    RegistryPresetResponse,
    RegistryTargetId,
} from '../../shared/registry-contracts'
import { fetchJSON, postJSON } from '../api-core'

type CatalogQuery = {
    q?: string
    kind?: RegistryListingKind
    target?: RegistryTargetId
    tag?: string
    limit?: number
    cursor?: string
}

function catalogSearchParams(query: CatalogQuery) {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && `${value}`.trim()) {
            params.set(key, `${value}`)
        }
    })
    return params.toString()
}

export const exploreApi = {
    catalog: (query: CatalogQuery = {}) =>
        fetchJSON<RegistryCatalogResponse>(`/api/explore/catalog?${catalogSearchParams(query)}`),

    listing: (idOrSlug: string) =>
        fetchJSON<RegistryListingResponse>(`/api/explore/listings/${encodeURIComponent(idOrSlug)}`),

    importListing: (idOrSlug: string) =>
        postJSON<RegistryImportListingResponse>(`/api/explore/listings/${encodeURIComponent(idOrSlug)}/import`, {}),

    presets: () =>
        fetchJSON<RegistryPresetListResponse>('/api/explore/presets'),

    preset: (idOrSlug: string) =>
        fetchJSON<RegistryPresetResponse>(`/api/explore/presets/${encodeURIComponent(idOrSlug)}`),
}
