// Model resolution and normalization utilities for agents

import type { RuntimeModelCatalogEntry } from '../../shared/model-variants'
import type { WorkspaceModelConfig } from '../../shared/workspace-contracts'
import { extractMcpServerNamesFromConfig } from '../../shared/mcp-config'

export function modelConfigFromPrimitiveValue(value: unknown): WorkspaceModelConfig | null {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    if (!normalized) {
        return null
    }

    const slashIndex = normalized.indexOf('/')
    const colonIndex = normalized.indexOf(':')
    const separatorIndex = slashIndex > 0 ? slashIndex : colonIndex > 0 ? colonIndex : -1

    if (separatorIndex === -1) {
        return null
    }

    const provider = normalized.slice(0, separatorIndex).trim()
    const modelId = normalized.slice(separatorIndex + 1).trim()
    if (!provider || !modelId) {
        return null
    }

    return { provider, modelId }
}

export function hasModelConfig(model: WorkspaceModelConfig | null | undefined): model is WorkspaceModelConfig {
    return !!(model && model.provider && model.modelId)
}

export function resolveImportedModel(
    model: WorkspaceModelConfig | string | null | undefined,
    runtimeModels: RuntimeModelCatalogEntry[],
): {
    model: WorkspaceModelConfig | null
    modelPlaceholder: WorkspaceModelConfig | null
} {
    const requested = typeof model === 'object' && model
        ? model
        : modelConfigFromPrimitiveValue(model)

    if (!requested) {
        return {
            model: null,
            modelPlaceholder: null,
        }
    }

    const match = runtimeModels.find((entry) => (
        entry.connected
        && entry.provider === requested.provider
        && entry.id === requested.modelId
    ))

    if (match) {
        return {
            model: {
                provider: match.provider,
                modelId: match.id,
            },
            // Preserve the original primitive recommendation even when matched
            modelPlaceholder: requested,
        }
    }

    return {
        model: null,
        modelPlaceholder: requested,
    }
}

export function normalizePrimitiveModelForStudio<T extends {
    model?: WorkspaceModelConfig | string | null
    modelPlaceholder?: WorkspaceModelConfig | null
}>(primitive: T, runtimeModels: RuntimeModelCatalogEntry[]): T & {
    model: WorkspaceModelConfig | null
    modelPlaceholder: WorkspaceModelConfig | null
} {
    const resolved = resolveImportedModel(primitive.model ?? null, runtimeModels)
    return {
        ...primitive,
        model: resolved.model,
        modelPlaceholder: primitive.modelPlaceholder || resolved.modelPlaceholder,
    }
}

export function normalizePrimitiveMcpForStudio<T extends {
    mcpConfig?: Record<string, unknown> | null
    mcpServerNames?: string[]
}>(primitive: T, availableMcpServerNames: string[]): T & {
    mcpServerNames: string[]
} {
    const declaredNames = Array.from(new Set([
        ...(primitive.mcpServerNames || []),
        ...extractMcpServerNamesFromConfig(primitive.mcpConfig),
    ].filter(Boolean)))
    const allowed = new Set(availableMcpServerNames)
    return {
        ...primitive,
        mcpServerNames: declaredNames.filter((name) => allowed.has(name)),
    }
}

export function modelConfigToPrimitiveValue(model: WorkspaceModelConfig | null | undefined): string | undefined {
    if (!model?.provider || !model?.modelId) {
        return undefined
    }
    return `${model.provider}/${model.modelId}`
}
