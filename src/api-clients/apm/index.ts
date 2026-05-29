import type {
    ApmGitHubImportRequest,
    ApmGitHubImportResponse,
    ApmGitHubImportPreviewResponse,
    ApmGitHubSourceCatalogRequest,
    ApmGitHubSourceCatalogResponse,
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
import { fetchJSON, postJSON, putJSON } from '../../api-core'

function scopeQuery(scope?: ApmPackageScope) {
    return scope ? `?scope=${scope}` : ''
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

    importPackage: (body: ApmPackageImportRequest) =>
        postJSON<ApmPackageImportResponse>('/api/apm/import', body),

    importGitHub: (body: ApmGitHubImportRequest) =>
        postJSON<ApmGitHubImportResponse>('/api/apm/import/github', body),

    previewGitHub: (body: ApmGitHubImportRequest) =>
        postJSON<ApmGitHubImportPreviewResponse>('/api/apm/import/github/preview', body),

    githubCatalog: (body: ApmGitHubSourceCatalogRequest = {}) =>
        postJSON<ApmGitHubSourceCatalogResponse>('/api/apm/github-catalog', body),

    listSyncTargets: () =>
        fetchJSON<ApmSyncTargetsResponse>('/api/apm/targets'),

    runTargetSync: (body: ApmSyncRunRequest) =>
        postJSON<ApmSyncRunResponse>('/api/apm/sync', body),

    validate: (manifest: unknown) =>
        postJSON<ApmValidationResult>('/api/apm/validate', { manifest } satisfies ApmValidationRequest),
}
