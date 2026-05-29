import { apmApi } from './api-clients/apm'
import type { DragPrimitive } from './lib/dnd-handlers'
import type { SharedPrimitiveRef } from '../shared/chat-contracts'
import type { ApmAgentExtension, ApmPackageManifest, ApmPackageReadResponse } from '../shared/apm-contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => !!value && !!value.trim())))
}

function registryUrnFromSharedRef(ref: SharedPrimitiveRef | null | undefined) {
    return ref?.kind === 'registry' ? ref.urn : null
}

function registryUrnsFromSharedRefs(refs: SharedPrimitiveRef[] | null | undefined) {
    return (refs || [])
        .map((ref) => registryUrnFromSharedRef(ref))
        .filter((urn): urn is string => !!urn)
}

function agentBodyFromManifest(manifest: ApmPackageManifest, agent: ApmAgentExtension | null | undefined) {
    const directBody = agent?.agentBody
    if (typeof directBody === 'string' && directBody.trim()) {
        return directBody
    }

    const firstAgent = Array.isArray(manifest.agents) ? manifest.agents[0] : null
    if (isRecord(firstAgent)) {
        const instruction = firstAgent.instruction
        if (typeof instruction === 'string' && instruction.trim()) {
            return instruction
        }
        if (isRecord(instruction) && typeof instruction.content === 'string' && instruction.content.trim()) {
            return instruction.content
        }
    }

    const firstInstruction = Array.isArray(manifest.instructions) ? manifest.instructions[0] : null
    if (typeof firstInstruction === 'string' && firstInstruction.trim()) {
        return firstInstruction
    }
    if (isRecord(firstInstruction) && typeof firstInstruction.content === 'string' && firstInstruction.content.trim()) {
        return firstInstruction.content
    }

    return null
}

function mcpServerNamesFromApmPackage(result: ApmPackageReadResponse, agent: ApmAgentExtension | null | undefined) {
    const dependencyNames = Array.isArray(result.manifest.dependencies?.mcp)
        ? result.manifest.dependencies.mcp
            .map((entry) => typeof entry === 'string' ? entry : entry.name)
            .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
        : []
    return uniqueStrings([
        ...(agent?.mcpServerNames || []),
        ...(result.lock?.mcp_servers || []),
        ...dependencyNames,
    ])
}

function apmPackageMcpConfig(result: ApmPackageReadResponse, mcpServerNames: string[]) {
    if (result.lock?.mcp_configs && Object.keys(result.lock.mcp_configs).length > 0) {
        return result.lock.mcp_configs
    }
    return mcpServerNames.length > 0 ? { servers: mcpServerNames } : null
}

export async function resolveApmPackageAgentPrimitive(
    primitive: DragPrimitive,
    showDropWarning: (message: string) => void,
): Promise<DragPrimitive | null> {
    const packageId = primitive.packageId || primitive.name
    if (!packageId) {
        showDropWarning('This APM package is missing a package id.')
        return null
    }

    const hasAgentPrimitive = primitive.packageKind === 'agent'
        || !!primitive.agentName
        || Number(primitive.primitiveCounts?.agents || 0) > 0
    if (!hasAgentPrimitive) {
        showDropWarning('Only APM packages with an Agent primitive can be dropped onto the canvas. Use Primitives for Instructions, Skills, and MCP.')
        return null
    }

    const scope = primitive.scope === 'user' ? 'user' : 'workspace'
    let result: ApmPackageReadResponse
    try {
        result = await apmApi.readPackage(packageId, scope)
    } catch (error) {
        console.error('Failed to read APM package for drop', error)
        showDropWarning(`Could not read APM package "${packageId}" before dropping it.`)
        return null
    }

    const manifest = result.manifest
    const agent = manifest['x-apm']?.agent || null
    const agentName = agent?.agentName
        || primitive.agentName
        || primitive.name
        || manifest.name
        || packageId
    const model = agent?.model && typeof agent.model === 'object' ? agent.model : null
    const mcpServerNames = mcpServerNamesFromApmPackage(result, agent)

    return {
        kind: 'agent',
        urn: `apm-package/${scope}/${result.packageId || packageId}`,
        source: scope,
        name: agentName,
        description: agent?.description
            || (typeof manifest.description === 'string' ? manifest.description : undefined)
            || primitive.description,
        instructionUrn: registryUrnFromSharedRef(agent?.instructionRef || null),
        skillUrns: registryUrnsFromSharedRefs(agent?.skillRefs || []),
        model,
        modelVariant: agent?.modelVariant || null,
        agentBody: agentBodyFromManifest(manifest, agent),
        runtimeAgentId: agent?.runtimeAgentId || null,
        planMode: agent?.planMode === true,
        mcpServerNames,
        mcpConfig: apmPackageMcpConfig(result, mcpServerNames),
    }
}
