import type {
    DanceExportRequest,
    DanceExportResponse,
    ApmAssetDanceReimportSourceRequest,
    ApmAssetDanceReimportSourceResponse,
    ApmAssetDanceUpdateApplyRequest,
    ApmAssetDanceUpdateApplyResponse,
    ApmAssetDanceUpdateCheckRequest,
    ApmAssetDanceUpdateCheckResponse,
    ApmAssetAuthUserResponse,
    ApmAssetInitResponse,
    ApmAssetInstallRequest,
    ApmAssetLoginResponse,
    ApmAssetSaveLocalRequest,
    ApmAssetStatusResponse,
} from '../../shared/apm-asset-contracts'
import type { AssetListItem } from '../../shared/asset-contracts'
import { fetchJSON, postJSON, putJSON, deleteJSON } from '../api-core'

type ApmAssetPerformerResponse = Record<string, unknown>
type ApmAssetInstallResponse = Record<string, unknown>

export const apmAssetsApi = {
    status: () =>
        fetchJSON<ApmAssetStatusResponse>('/api/apm/assets/status'),

    authUser: () =>
        fetchJSON<ApmAssetAuthUserResponse>('/api/apm/assets/auth-user'),

    login: (acknowledgedTos = false) =>
        postJSON<ApmAssetLoginResponse>('/api/apm/assets/login', { acknowledgedTos }),

    logout: () =>
        postJSON<{ ok: boolean }>('/api/apm/assets/logout'),

    init: () =>
        postJSON<ApmAssetInitResponse>('/api/apm/assets/init'),

    performer: (name: string) =>
        fetchJSON<ApmAssetPerformerResponse>(`/api/apm/assets/performers/${name}`),

    agents: () =>
        fetchJSON<Record<string, string>>('/api/apm/assets/agents'),

    updateAgents: (manifest: Record<string, string>) =>
        putJSON<{ ok: boolean }>('/api/apm/assets/agents', manifest),

    install: (urn: string, localName?: string, force?: boolean, scope?: 'global' | 'stage') =>
        postJSON<ApmAssetInstallResponse>('/api/apm/assets/install', { urn, localName, force, scope } satisfies ApmAssetInstallRequest),

    saveLocalAsset: (
        kind: 'tal' | 'dance' | 'performer' | 'act',
        slug: string,
        payload: Record<string, unknown>,
        author?: string,
        stage?: string,
    ) =>
        putJSON<{ ok: boolean; urn: string; path: string; existed: boolean; payload: Record<string, unknown> }>('/api/apm/assets/local', { kind, slug, payload, author, stage } satisfies ApmAssetSaveLocalRequest),

    search: (query: string, kind?: string, limit?: number) =>
        fetchJSON<AssetListItem[]>(
            `/api/apm/assets/search?q=${encodeURIComponent(query)}${kind ? `&kind=${kind}` : ''}${limit ? `&limit=${limit}` : ''}`,
        ),

    validate: (performer: Record<string, unknown>) =>
        postJSON<{ valid: boolean; error?: string }>('/api/apm/assets/validate', performer),

    uninstallAsset: (kind: 'tal' | 'dance' | 'performer' | 'act', urn: string, cascade = false) =>
        deleteJSON<{ ok: boolean; urn: string; scope: 'global' | 'stage'; deletedUrns: string[] }>('/api/apm/assets/local', { kind, urn, cascade }),

    previewUninstall: (kind: 'tal' | 'dance' | 'performer' | 'act', urn: string) =>
        postJSON<{
            target: { urn: string; kind: string; name: string; source: string; reason: string }
            dependents: Array<{ urn: string; kind: string; name: string; source: string; reason: string }>
        }>('/api/apm/assets/uninstall-preview', { kind, urn }),

    addFromGitHub: (source: string, scope?: 'global' | 'stage') =>
        postJSON<{
            installed: Array<{ urn: string; name: string; description: string }>
            source: string
        }>('/api/apm/assets/add', { source, scope }),

    checkDanceUpdates: (body: ApmAssetDanceUpdateCheckRequest) =>
        postJSON<ApmAssetDanceUpdateCheckResponse>('/api/apm/assets/dance-updates/check', body),

    applyDanceUpdates: (body: ApmAssetDanceUpdateApplyRequest) =>
        postJSON<ApmAssetDanceUpdateApplyResponse>('/api/apm/assets/dance-updates/apply', body),

    reimportDanceSource: (body: ApmAssetDanceReimportSourceRequest) =>
        postJSON<ApmAssetDanceReimportSourceResponse>('/api/apm/assets/dance-updates/reimport-source', body),

    exportDanceBundle: (draftId: string, slug: string, destinationParentPath: string, overwrite = false) =>
        postJSON<DanceExportResponse>(
            '/api/apm/assets/dance-export',
            { draftId, slug, destinationParentPath, overwrite } satisfies DanceExportRequest,
        ),
}
