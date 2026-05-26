import type {
    DanceExportRequest,
    DanceExportResponse,
    RosterDanceReimportSourceRequest,
    RosterDanceReimportSourceResponse,
    RosterDanceUpdateApplyRequest,
    RosterDanceUpdateApplyResponse,
    RosterDanceUpdateCheckRequest,
    RosterDanceUpdateCheckResponse,
    RosterAuthUserResponse,
    RosterInitResponse,
    RosterInstallRequest,
    RosterLoginResponse,
    RosterSaveLocalRequest,
    RosterStatusResponse,
} from '../../shared/roster-contracts'
import type { AssetListItem } from '../../shared/asset-contracts'
import { fetchJSON, postJSON, putJSON, deleteJSON } from '../api-core'

type RosterPerformerResponse = Record<string, unknown>
type RosterInstallResponse = Record<string, unknown>

export const rosterApi = {
    status: () =>
        fetchJSON<RosterStatusResponse>('/api/roster/status'),

    authUser: () =>
        fetchJSON<RosterAuthUserResponse>('/api/roster/auth-user'),

    login: (acknowledgedTos = false) =>
        postJSON<RosterLoginResponse>('/api/roster/login', { acknowledgedTos }),

    logout: () =>
        postJSON<{ ok: boolean }>('/api/roster/logout'),

    init: () =>
        postJSON<RosterInitResponse>('/api/roster/init'),

    performer: (name: string) =>
        fetchJSON<RosterPerformerResponse>(`/api/roster/performers/${name}`),

    agents: () =>
        fetchJSON<Record<string, string>>('/api/roster/agents'),

    updateAgents: (manifest: Record<string, string>) =>
        putJSON<{ ok: boolean }>('/api/roster/agents', manifest),

    install: (urn: string, localName?: string, force?: boolean, scope?: 'global' | 'stage') =>
        postJSON<RosterInstallResponse>('/api/roster/install', { urn, localName, force, scope } satisfies RosterInstallRequest),

    saveLocalAsset: (
        kind: 'tal' | 'dance' | 'performer' | 'act',
        slug: string,
        payload: Record<string, unknown>,
        author?: string,
        stage?: string,
    ) =>
        putJSON<{ ok: boolean; urn: string; path: string; existed: boolean; payload: Record<string, unknown> }>('/api/roster/assets/local', { kind, slug, payload, author, stage } satisfies RosterSaveLocalRequest),

    search: (query: string, kind?: string, limit?: number) =>
        fetchJSON<AssetListItem[]>(
            `/api/roster/search?q=${encodeURIComponent(query)}${kind ? `&kind=${kind}` : ''}${limit ? `&limit=${limit}` : ''}`,
        ),

    validate: (performer: Record<string, unknown>) =>
        postJSON<{ valid: boolean; error?: string }>('/api/roster/validate', performer),

    uninstallAsset: (kind: 'tal' | 'dance' | 'performer' | 'act', urn: string, cascade = false) =>
        deleteJSON<{ ok: boolean; urn: string; scope: 'global' | 'stage'; deletedUrns: string[] }>('/api/roster/assets/local', { kind, urn, cascade }),

    previewUninstall: (kind: 'tal' | 'dance' | 'performer' | 'act', urn: string) =>
        postJSON<{
            target: { urn: string; kind: string; name: string; source: string; reason: string }
            dependents: Array<{ urn: string; kind: string; name: string; source: string; reason: string }>
        }>('/api/roster/assets/uninstall-preview', { kind, urn }),

    addFromGitHub: (source: string, scope?: 'global' | 'stage') =>
        postJSON<{
            installed: Array<{ urn: string; name: string; description: string }>
            source: string
        }>('/api/roster/add', { source, scope }),

    checkDanceUpdates: (body: RosterDanceUpdateCheckRequest) =>
        postJSON<RosterDanceUpdateCheckResponse>('/api/roster/dance-updates/check', body),

    applyDanceUpdates: (body: RosterDanceUpdateApplyRequest) =>
        postJSON<RosterDanceUpdateApplyResponse>('/api/roster/dance-updates/apply', body),

    reimportDanceSource: (body: RosterDanceReimportSourceRequest) =>
        postJSON<RosterDanceReimportSourceResponse>('/api/roster/dance-updates/reimport-source', body),

    exportDanceBundle: (draftId: string, slug: string, destinationParentPath: string, overwrite = false) =>
        postJSON<DanceExportResponse>(
            '/api/roster/dance-export',
            { draftId, slug, destinationParentPath, overwrite } satisfies DanceExportRequest,
        ),
}
