import type {
    DiscordConfigUpdateRequest,
    DiscordIntegrationStatus,
    DiscordSyncRequest,
    DiscordSyncResponse,
} from '../../../shared/discord-contracts'
import { fetchJSON, postJSON, putJSON } from '../../api-core'

export const discordApi = {
    status: () => fetchJSON<DiscordIntegrationStatus>('/api/discord/status'),
    updateConfig: (body: DiscordConfigUpdateRequest) =>
        putJSON<DiscordIntegrationStatus>('/api/discord/config', body),
    disconnect: () => postJSON<DiscordIntegrationStatus>('/api/discord/disconnect'),
    sync: (workspaceId?: string | null) =>
        postJSON<DiscordSyncResponse>(
            '/api/discord/sync',
            (workspaceId ? { workspaceId } : {}) satisfies DiscordSyncRequest,
        ),
}
