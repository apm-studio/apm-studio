// Agent node factory functions

import type {
    SharedPrimitiveRef } from '../../shared/chat-contracts'
import type { WorkspaceAgentScope,
    WorkspaceModelConfig,
    WorkspaceAgentNode,
} from '../../shared/workspace-contracts'
import {
    normalizeAgentPrimitiveInput,
    sanitizeMcpBindingMap,
} from './agents-package'

export const AGENT_DEFAULT_WIDTH = 320
export const AGENT_DEFAULT_HEIGHT = 480

export function createAgentNode(input: {
    id: string
    name: string
    x: number
    y: number
    scope?: WorkspaceAgentScope
    instructionRef?: SharedPrimitiveRef | null
    skillRefs?: SharedPrimitiveRef[]
    model?: WorkspaceModelConfig | null
    modelPlaceholder?: WorkspaceModelConfig | null
    modelVariant?: string | null
    runtimeAgentId?: string | null
    mcpServerNames?: string[]
    agentBody?: string | null
    mcpBindingMap?: Record<string, string>
    declaredMcpConfig?: Record<string, unknown> | null
    planMode?: boolean
    hidden?: boolean
    meta?: {
        derivedFrom?: string | null
        sourceBindingUrn?: string | null
        authoring?: {
            slug?: string
            description?: string
            tags?: string[]
        }
    }
}): WorkspaceAgentNode {
    return {
        id: input.id,
        name: input.name,
        position: { x: input.x, y: input.y },
        width: AGENT_DEFAULT_WIDTH,
        height: AGENT_DEFAULT_HEIGHT,
        scope: input.scope || 'shared',
        model: input.model || null,
        ...(input.modelPlaceholder ? { modelPlaceholder: input.modelPlaceholder } : {}),
        ...(input.modelVariant ? { modelVariant: input.modelVariant } : {}),
        ...(input.runtimeAgentId ? { runtimeAgentId: input.runtimeAgentId } : {}),
        instructionRef: input.instructionRef || null,
        ...(typeof input.agentBody === 'string' ? { agentBody: input.agentBody } : {}),
        skillRefs: input.skillRefs || [],
        mcpServerNames: Array.from(new Set(input.mcpServerNames || [])),
        mcpBindingMap: sanitizeMcpBindingMap(input.mcpBindingMap),
        declaredMcpConfig: input.declaredMcpConfig || null,
        ...(input.planMode ? { planMode: input.planMode } : {}),
        ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
    }
}

export function createAgentNodeFromPrimitive(input: {
    id: string
    primitive: {
        name: string
        urn?: string | null
        instructionUrn?: string | null
        skillUrns?: string[]
        model?: WorkspaceModelConfig | string | null
        modelVariant?: string | null
        modelPlaceholder?: WorkspaceModelConfig | null
        agentBody?: string | null
        runtimeAgentId?: string | null
        planMode?: boolean
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, unknown> | null
        description?: string
    }
    x: number
    y: number
    scope?: WorkspaceAgentScope
    hidden?: boolean
}): WorkspaceAgentNode {
    const normalized = normalizeAgentPrimitiveInput(input.primitive)
    return createAgentNode({
        id: input.id,
        name: normalized.name,
        x: input.x,
        y: input.y,
        scope: input.scope,
        instructionRef: normalized.instructionRef,
        skillRefs: normalized.skillRefs,
        model: normalized.model,
        modelPlaceholder: normalized.modelPlaceholder,
        modelVariant: normalized.modelVariant,
        runtimeAgentId: normalized.runtimeAgentId,
        agentBody: normalized.agentBody,
        planMode: normalized.planMode,
        mcpServerNames: normalized.mcpServerNames,
        mcpBindingMap: normalized.mcpBindingMap,
        declaredMcpConfig: normalized.declaredMcpConfig,
        hidden: input.hidden,
        meta: normalized.meta,
    })
}

export function cloneAgentNode(input: {
    id: string
    source: WorkspaceAgentNode
    x: number
    y: number
    scope?: WorkspaceAgentScope
    hidden?: boolean
    name?: string
    carrySourceBinding?: boolean
    preserveAuthoring?: boolean
}): WorkspaceAgentNode {
    const sourceUrn = input.source.meta?.sourceBindingUrn
        || input.source.meta?.derivedFrom
        || null
    return createAgentNode({
        id: input.id,
        name: input.name || input.source.name,
        x: input.x,
        y: input.y,
        scope: input.scope || input.source.scope,
        instructionRef: input.source.instructionRef,
        agentBody: input.source.agentBody || null,
        skillRefs: input.source.skillRefs,
        model: input.source.model,
        modelPlaceholder: input.source.modelPlaceholder || null,
        modelVariant: input.source.modelVariant || null,
        runtimeAgentId: input.source.runtimeAgentId || null,
        mcpServerNames: input.source.mcpServerNames,
        mcpBindingMap: input.source.mcpBindingMap,
        declaredMcpConfig: input.source.declaredMcpConfig,
        planMode: input.source.planMode,
        hidden: input.hidden ?? input.source.hidden,
        meta: {
            ...(sourceUrn ? { derivedFrom: sourceUrn } : {}),
            ...(input.carrySourceBinding && sourceUrn ? { sourceBindingUrn: sourceUrn } : {}),
            ...(input.preserveAuthoring && input.source.meta?.authoring ? { authoring: input.source.meta.authoring } : {}),
        },
    })
}
