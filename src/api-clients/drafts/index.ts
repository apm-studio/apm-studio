import type {
    BundleFileOperationResponse,
    BundleFileReadResponse,
    BundleFolderOpenResponse,
    BundleTreeResponse,
    CreateDraftRequest,
    DraftDeletePreviewResponse,
    DraftDeleteResponse,
    DraftFile,
    DraftKind,
    DraftListResponse,
    DraftResponse,
    UpdateDraftRequest,
} from '../../../shared/draft-contracts'
import { deleteJSON, fetchJSON, postJSON, putJSON } from '../../api-core'

type HydratedDraft = DraftFile & {
    saveState: 'saved'
}

function hydrateDraft(draft: DraftFile | HydratedDraft): HydratedDraft {
    return {
        ...draft,
        saveState: 'saved',
    }
}

export const draftApi = {
    list: (kind?: DraftKind) =>
        fetchJSON<DraftListResponse>(`/api/drafts${kind ? `?kind=${kind}` : ''}`)
            .then((response) => response.drafts.map(hydrateDraft)),

    get: (kind: DraftKind, id: string) =>
        fetchJSON<DraftResponse>(`/api/drafts/${kind}/${id}`)
            .then((response) => hydrateDraft(response.draft)),

    create: <K extends DraftKind>(body: CreateDraftRequest<K>) =>
        postJSON<DraftResponse>('/api/drafts', body)
            .then((response) => hydrateDraft(response.draft)),

    update: <K extends DraftKind>(kind: K, id: string, patch: UpdateDraftRequest<K>) =>
        putJSON<DraftResponse>(`/api/drafts/${kind}/${id}`, patch)
            .then((response) => hydrateDraft(response.draft)),

    delete: (kind: DraftKind, id: string, cascade = false) =>
        deleteJSON<DraftDeleteResponse>(`/api/drafts/${kind}/${id}`, { cascade }),

    previewDelete: (kind: DraftKind, id: string) =>
        postJSON<DraftDeletePreviewResponse>(`/api/drafts/delete-preview/${kind}/${id}`, {}),

    skillBundle: {
        tree: (id: string) =>
            fetchJSON<BundleTreeResponse>(`/api/drafts/skill/${id}/tree`)
                .then((response) => response.tree),

        readFile: (id: string, filePath: string) =>
            fetchJSON<BundleFileReadResponse>(`/api/drafts/skill/${id}/file?path=${encodeURIComponent(filePath)}`),

        writeFile: (id: string, filePath: string, content: string) =>
            putJSON<BundleFileOperationResponse>(`/api/drafts/skill/${id}/file`, { path: filePath, content }),

        createFile: (id: string, filePath: string, isDirectory?: boolean) =>
            postJSON<BundleFileOperationResponse>(`/api/drafts/skill/${id}/files`, { path: filePath, isDirectory }),

        deleteFile: (id: string, filePath: string) =>
            deleteJSON<BundleFileOperationResponse>(`/api/drafts/skill/${id}/file`, { path: filePath }),

        openFolder: (id: string) =>
            postJSON<BundleFolderOpenResponse>(`/api/drafts/skill/${id}/open-folder`, {}),
    },
}
