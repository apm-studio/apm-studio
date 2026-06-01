import type {
    ApmGitHubImportRequest,
    ApmGitHubImportResponse,
    ApmGitHubImportPreviewResponse,
    ApmGitHubSourceCatalogRequest,
    ApmGitHubSourceCatalogResponse,
    ApmPackageCopyRequest,
    ApmPackageCopyResponse,
    ApmPackageImportResponse,
    ApmPackageImportRequest,
    ApmPackageListResponse,
    ApmPackageReadResponse,
    ApmToolingResponse,
    ApmPackageWriteRequest,
    ApmPackageWriteResponse,
    ApmValidationRequest,
    ApmValidationResult,
    ApmPackageScope,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncRunRequest,
    ApmSyncRunResponse,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-sync-contracts'
import type {
    RegistryCatalogResponse,
    RegistryListingKind,
    RegistryTargetId,
} from '../../../shared/registry-contracts'
import { fetchJSON, postJSON, putJSON } from '../../api-core'

function scopeQuery(scope?: ApmPackageScope) {
    return scope ? `?scope=${scope}` : ''
}

type RegistryCatalogQuery = {
    q?: string
    kind?: RegistryListingKind | 'all'
    target?: RegistryTargetId | 'all'
    tag?: string
    limit?: number
    cursor?: string
}

function registryCatalogQuery(query: RegistryCatalogQuery = {}) {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && `${value}`.trim()) {
            params.set(key, `${value}`)
        }
    })
    const serialized = params.toString()
    return serialized ? `?${serialized}` : ''
}

export const apmApi = {
    packages: (scope?: ApmPackageScope) =>
        fetchJSON<ApmPackageListResponse>(`/api/apm/packages${scopeQuery(scope)}`),

    tooling: () =>
        fetchJSON<ApmToolingResponse>('/api/apm/tooling'),

    readPackage: (packageId: string, scope?: ApmPackageScope) =>
        fetchJSON<ApmPackageReadResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}${scopeQuery(scope)}`),

    writePackage: (packageId: string, body: ApmPackageWriteRequest, scope?: ApmPackageScope) =>
        putJSON<ApmPackageWriteResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}${scopeQuery(scope)}`, body),

    copyPackage: (body: ApmPackageCopyRequest) =>
        postJSON<ApmPackageCopyResponse>('/api/apm/packages/copy', body),

    importPackage: (body: ApmPackageImportRequest) =>
        postJSON<ApmPackageImportResponse>('/api/apm/import', body),

    importGitHub: (body: ApmGitHubImportRequest) =>
        postJSON<ApmGitHubImportResponse>('/api/apm/import/github', body),

    previewGitHub: (body: ApmGitHubImportRequest) =>
        postJSON<ApmGitHubImportPreviewResponse>('/api/apm/import/github/preview', body),

    githubCatalog: (body: ApmGitHubSourceCatalogRequest = {}) =>
        postJSON<ApmGitHubSourceCatalogResponse>('/api/apm/github-catalog', body),

    registryCatalog: (query: RegistryCatalogQuery = {}) =>
        fetchJSON<RegistryCatalogResponse>(`/api/apm/import/catalog${registryCatalogQuery(query)}`),

    listSyncTargets: () =>
        fetchJSON<ApmSyncTargetsResponse>('/api/apm/targets'),

    runTargetSync: (body: ApmSyncRunRequest) =>
        postJSON<ApmSyncRunResponse>('/api/apm/sync', body),

    validate: (manifest: unknown) =>
        postJSON<ApmValidationResult>('/api/apm/validate', { manifest } satisfies ApmValidationRequest),
}
