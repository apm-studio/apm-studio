import type {
    AgentSyncOverview,
    AgentSyncRunRequest,
    AgentSyncRunResponse,
} from '../../shared/agent-sync-contracts.js'
import { StudioValidationError } from '../lib/opencode-errors.js'
import {
    getCodexAgentSyncOverview,
    pruneCodexAgentSync,
    syncCodexAgentSync,
} from './agent-sync/codex-agent-sync-provider.js'

type AgentSyncProvider = {
    id: string
    getOverview: (workingDir: string) => Promise<{
        provider: AgentSyncOverview['providers'][number]
        performers: AgentSyncOverview['performers']
    }>
    sync: (workingDir: string, request?: AgentSyncRunRequest) => Promise<AgentSyncRunResponse>
    prune: (workingDir: string) => Promise<AgentSyncRunResponse>
}

const providers: AgentSyncProvider[] = [{
    id: 'codex',
    getOverview: getCodexAgentSyncOverview,
    sync: syncCodexAgentSync,
    prune: pruneCodexAgentSync,
}]

function findProvider(providerId: string) {
    const provider = providers.find((candidate) => candidate.id === providerId)
    if (!provider) {
        throw new StudioValidationError(`Unknown agent sync provider: ${providerId}`)
    }
    return provider
}

export async function getAgentSyncOverview(workingDir: string): Promise<AgentSyncOverview> {
    const summaries = await Promise.all(providers.map((provider) => provider.getOverview(workingDir)))
    return {
        providers: summaries.map((summary) => summary.provider),
        performers: summaries.flatMap((summary) => summary.performers),
    }
}

export async function runAgentSync(
    workingDir: string,
    providerId: string,
    request?: AgentSyncRunRequest,
) {
    return findProvider(providerId).sync(workingDir, request || {})
}

export async function pruneAgentSync(workingDir: string, providerId: string) {
    return findProvider(providerId).prune(workingDir)
}
