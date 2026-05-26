import type {
    AgentSyncOverview,
    AgentSyncRunRequest,
    AgentSyncRunResponse,
} from '../../shared/agent-sync-contracts'
import { fetchJSON, postJSON } from '../api-core'

export const agentSyncApi = {
    overview: () => fetchJSON<AgentSyncOverview>('/api/agent-sync'),
    sync: (providerId: string, request?: AgentSyncRunRequest) =>
        postJSON<AgentSyncRunResponse>(`/api/agent-sync/${encodeURIComponent(providerId)}/sync`, request || {}),
    prune: (providerId: string) =>
        postJSON<AgentSyncRunResponse>(`/api/agent-sync/${encodeURIComponent(providerId)}/prune`, {}),
}
