import { opencodeApi } from '../api-clients/opencode'
import { mcpServerNamesFromConfig } from '../../shared/mcp-catalog'
import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import type { WorkspaceModelConfig } from '../../shared/workspace-contracts'
import { normalizePrimitiveMcpForStudio, normalizePrimitiveModelForStudio } from './agents'

export type AgentImportPrimitive = {
    model?: WorkspaceModelConfig | string | null
    modelPlaceholder?: WorkspaceModelConfig | null
    mcpConfig?: Record<string, unknown> | null
    mcpServerNames?: string[]
}

export type AgentImportContext = {
    runtimeModels: RuntimeModelCatalogEntry[]
    availableMcpServerNames: string[]
}

export async function loadAgentImportContext(): Promise<AgentImportContext> {
    const [globalConfig, runtimeModels] = await Promise.all([
        opencodeApi.config.getGlobal().catch(() => ({})),
        opencodeApi.models.list().catch(() => []),
    ])

    return {
        runtimeModels,
        availableMcpServerNames: mcpServerNamesFromConfig(globalConfig),
    }
}

export function normalizeImportedAgentPrimitive<T extends AgentImportPrimitive>(
    primitive: T,
    context: AgentImportContext,
): T & {
    model: WorkspaceModelConfig | null
    modelPlaceholder: WorkspaceModelConfig | null
    mcpServerNames: string[]
} {
    return normalizePrimitiveMcpForStudio(
        normalizePrimitiveModelForStudio(primitive, context.runtimeModels),
        context.availableMcpServerNames,
    )
}
