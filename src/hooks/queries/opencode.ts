import { useQuery } from '@tanstack/react-query'
import { opencodeApi } from '../../api-clients/opencode'
import { useStudioStore } from '../../store'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type {
    McpServerSummary,
    OpenCodeAgentSummary,
    RuntimeToolResolution,
} from '../../../shared/opencode-contracts'
import type { WorkspaceModelConfig } from '../../../shared/workspace-contracts'
import { queryKeys } from './keys'

export function useModels(enabled = true) {
    const workingDir = useStudioStore((state) => state.workingDir)
    return useQuery<RuntimeModelCatalogEntry[]>({
        queryKey: queryKeys.models(workingDir),
        queryFn: () => opencodeApi.models.list(),
        enabled,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
    })
}

export function useAgents(enabled = true) {
    const workingDir = useStudioStore((state) => state.workingDir)
    return useQuery<OpenCodeAgentSummary[]>({
        queryKey: [...queryKeys.agents, workingDir],
        queryFn: () => opencodeApi.agents.list(),
        enabled,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
    })
}

export function useMcpServers(enabled = true) {
    const workingDir = useStudioStore((state) => state.workingDir)
    return useQuery<McpServerSummary[]>({
        queryKey: [...queryKeys.mcpServers, workingDir],
        queryFn: () => opencodeApi.mcp.list(),
        enabled,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
    })
}

export function useRuntimeTools(model: WorkspaceModelConfig | null, mcpServerNames: string[], enabled = true) {
    const workingDir = useStudioStore((state) => state.workingDir)
    const modelKey = model ? `${model.provider}:${model.modelId}` : 'none'
    const serverKey = [...mcpServerNames].sort().join(',')
    return useQuery<RuntimeToolResolution>({
        queryKey: queryKeys.runtimeTools(workingDir, modelKey, serverKey),
        queryFn: () => opencodeApi.runtime.resolveTools({ model, mcpServerNames }),
        enabled: enabled && mcpServerNames.length > 0,
        staleTime: 15_000,
        gcTime: 5 * 60_000,
    })
}

export function useServerHealth() {
    return useQuery({
        queryKey: queryKeys.serverHealth,
        queryFn: async () => {
            await opencodeApi.health()
            return true
        },
        retry: 2,
        staleTime: 30_000,
    })
}
