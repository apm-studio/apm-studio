import type {
    ApmGitHubImportRequest,
    ApmGitHubImportResponse,
    ApmGitHubImportPreviewResponse,
    ApmGitHubSourceCatalogRequest,
    ApmGitHubSourceCatalogResponse,
    ApmPackageCopyRequest,
    ApmPackageCopyResponse,
    ApmPackageDeleteResponse,
    ApmPackageImportResponse,
    ApmPackageImportRequest,
    ApmPackageListResponse,
    ApmPackageReadResponse,
    ApmAuditResponse,
    ApmToolingResponse,
    ApmPackageWriteRequest,
    ApmPackageWriteResponse,
    ApmPrimitiveFileListResponse,
    ApmPrimitiveFileReadResponse,
    ApmValidationRequest,
    ApmValidationResult,
    ApmPackageScope,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncRunRequest,
    ApmSyncRunResponse,
    ApmTargetDefinitionImportRequest,
    ApmTargetDefinitionImportResponse,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-sync-contracts'
import type {
    RegistryCatalogResponse,
    RegistryListingKind,
    RegistryTargetId,
} from '../../../shared/registry-contracts'
import { deleteJSON, fetchJSON, postJSON, putJSON } from '../../api-core'

function scopeQuery(scope?: ApmPackageScope) {
    return scope ? `?scope=${scope}` : ''
}

function packageFileQuery(scope: ApmPackageScope | undefined, path?: string) {
    const params = new URLSearchParams()
    if (scope) params.set('scope', scope)
    if (path) params.set('path', path)
    const serialized = params.toString()
    return serialized ? `?${serialized}` : ''
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

    audit: () =>
        fetchJSON<ApmAuditResponse>('/api/apm/audit'),

    readPackage: (packageId: string, scope?: ApmPackageScope) =>
        fetchJSON<ApmPackageReadResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}${scopeQuery(scope)}`),

    writePackage: (packageId: string, body: ApmPackageWriteRequest, scope?: ApmPackageScope) =>
        putJSON<ApmPackageWriteResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}${scopeQuery(scope)}`, body),

    listPackagePrimitives: (packageId: string, scope?: ApmPackageScope) =>
        fetchJSON<ApmPrimitiveFileListResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}/primitives${scopeQuery(scope)}`),

    readPackagePrimitive: (packageId: string, path: string, scope?: ApmPackageScope) =>
        fetchJSON<ApmPrimitiveFileReadResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}/primitives/file${packageFileQuery(scope, path)}`),

    syncPackageSource: (packageId: string, scope?: ApmPackageScope) =>
        postJSON<ApmPackageWriteResponse & { synced: boolean }>(`/api/apm/packages/${encodeURIComponent(packageId)}/sync-source${scopeQuery(scope)}`),

    regeneratePackageLock: (packageId: string, baseManifestHash?: string, scope?: ApmPackageScope) =>
        postJSON<ApmPackageWriteResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}/lock/regenerate${scopeQuery(scope)}`, { baseManifestHash }),

    deletePackage: (packageId: string, scope?: ApmPackageScope) =>
        deleteJSON<ApmPackageDeleteResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}${scopeQuery(scope)}`),

    copyPackage: (body: ApmPackageCopyRequest) =>
        postJSON<ApmPackageCopyResponse>('/api/apm/packages/copy', body),

    importPackage: (body: ApmPackageImportRequest) =>
        postJSON<ApmPackageImportResponse>('/api/apm/import', body),

    importGitHub: (body: ApmGitHubImportRequest) =>
        postJSON<ApmGitHubImportResponse>('/api/apm/import/github', body),

    importTargetDefinition: (body: ApmTargetDefinitionImportRequest) =>
        postJSON<ApmTargetDefinitionImportResponse>('/api/apm/import/target-definition', body),

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
