import type {
    DeleteWorkspaceResponse,
    SavedWorkspaceListResponse,
    SavedWorkspaceSnapshot,
    SaveWorkspaceResponse,
    SetWorkspaceHiddenResponse,
} from '../../../shared/workspace-contracts'
import { deleteJSON, fetchJSON, patchJSON, putJSON } from '../../api-core'

export const savedWorkspacesApi = {
    list: (includeHidden = false) =>
        fetchJSON<SavedWorkspaceListResponse>(`/api/workspaces${includeHidden ? '?includeHidden=1' : ''}`)
            .then((response) => response.workspaces),

    get: (id: string) =>
        fetchJSON<SavedWorkspaceSnapshot>(`/api/workspaces/${id}`),

    save: (data: SavedWorkspaceSnapshot) =>
        putJSON<SaveWorkspaceResponse>('/api/workspaces', data),

    setHidden: (id: string, hiddenFromList: boolean) =>
        patchJSON<SetWorkspaceHiddenResponse>(`/api/workspaces/${id}`, { hiddenFromList }),

    delete: (id: string) =>
        deleteJSON<DeleteWorkspaceResponse>(`/api/workspaces/${id}`),
}
