import type {
    StudioActivateResponse,
    StudioConfigPatch,
    StudioConfigResponse,
    StudioHealthResponse,
    StudioOpenPathResponse,
    StudioPickDirectoryResponse,
} from '../../../shared/studio-contracts'
import { fetchJSON, postJSON, putJSON } from '../../api-core'

export const studioApi = {
    health: () =>
        fetchJSON<StudioHealthResponse>('/api/health'),

    getConfig: () =>
        fetchJSON<StudioConfigResponse>('/api/studio/config'),

    updateConfig: (config: StudioConfigPatch) =>
        putJSON<StudioConfigResponse>('/api/studio/config', config),

    activate: (workingDir: string) =>
        postJSON<StudioActivateResponse>('/api/studio/activate', { workingDir }),

    openPath: (targetPath: string) =>
        postJSON<StudioOpenPathResponse>('/api/studio/open-path', { path: targetPath }),

    pickDirectory: (prompt?: string) =>
        fetchJSON<StudioPickDirectoryResponse>(`/api/studio/pick-directory${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ''}`),
}
