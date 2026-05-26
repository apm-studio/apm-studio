import type {
    ApmPackageExportResponse,
    ApmPackageImportRequest,
    ApmPackageListResponse,
    ApmPackageReadResponse,
    ApmPackageWriteRequest,
    ApmPackageWriteResponse,
    ApmValidationResult,
} from '../../shared/apm-contracts'
import { fetchJSON, postJSON, putJSON } from '../api-core'

export const apmApi = {
    packages: () =>
        fetchJSON<ApmPackageListResponse>('/api/apm/packages'),

    readPackage: (packageId: string) =>
        fetchJSON<ApmPackageReadResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}`),

    writePackage: (packageId: string, body: ApmPackageWriteRequest) =>
        putJSON<ApmPackageWriteResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}`, body),

    exportPackage: (packageId: string) =>
        postJSON<ApmPackageExportResponse>(`/api/apm/packages/${encodeURIComponent(packageId)}/export`, {}),

    importPackage: (body: ApmPackageImportRequest) =>
        postJSON<ApmPackageWriteResponse>('/api/apm/import', body),

    validate: (manifest: unknown) =>
        postJSON<ApmValidationResult>('/api/apm/validate', { manifest }),
}
