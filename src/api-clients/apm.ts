import type {
    ApmGitHubImportRequest,
    ApmGitHubImportResponse,
    ApmGitHubImportPreviewResponse,
    ApmGitHubSourceCatalogRequest,
    ApmGitHubSourceCatalogResponse,
    ApmPackageExportResponse,
    ApmPackageImportRequest,
    ApmPackageListResponse,
    ApmPackageReadResponse,
    ApmToolingResponse,
    ApmSyncRunRequest,
    ApmSyncRunResponse,
    ApmSyncTargetsResponse,
    ApmPackageWriteRequest,
    ApmPackageWriteResponse,
    ApmValidationResult,
} from '../../shared/apm-contracts'
import { fetchJSON, postJSON, putJSON } from '../api-core'

export const apmApi = {
    packages: (scope?: 'stage' | 'global') =>
        fetchJSON<ApmPackageListResponse>(`/api/apm/packages${scope ? `?scope=${scope}` : ''}`),

    tooling: () =>
        fetchJSON<ApmToolingResponse>('/api/apm/tooling'),

    readPackage: (packageId: string, scope?: 'stage' | 'global') =>
        fetchJSON<ApmPackageReadResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}${scope ? `?scope=${scope}` : ''}`),

    writePackage: (packageId: string, body: ApmPackageWriteRequest) =>
        putJSON<ApmPackageWriteResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}`, body),

    exportPackage: (packageId: string) =>
        postJSON<ApmPackageExportResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}/export`, {}),

    importPackage: (body: ApmPackageImportRequest) =>
        postJSON<ApmPackageWriteResponse>('/api/apm/import', body),

    importGitHub: (body: ApmGitHubImportRequest) =>
        postJSON<ApmGitHubImportResponse>('/api/apm/import/github', body),

    previewGitHub: (body: ApmGitHubImportRequest) =>
        postJSON<ApmGitHubImportPreviewResponse>('/api/apm/import/github/preview', body),

    githubCatalog: (body: ApmGitHubSourceCatalogRequest = {}) =>
        postJSON<ApmGitHubSourceCatalogResponse>('/api/apm/github-catalog', body),

    syncTargets: () =>
        fetchJSON<ApmSyncTargetsResponse>('/api/apm/targets'),

    syncTarget: (body: ApmSyncRunRequest) =>
        postJSON<ApmSyncRunResponse>('/api/apm/sync', body),

    validate: (manifest: unknown) =>
        postJSON<ApmValidationResult>('/api/apm/validate', { manifest }),
}
