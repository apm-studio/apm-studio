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

function packageUrn(scope: string, packageId: string) {
    return `apm-package/${scope}/${packageId}`
}

function packageSupportsDropType(primitive: DragPrimitive, dropType: string | undefined) {
    const packageKind = primitive.packageKind
    const counts = primitive.primitiveCounts || {}

    if (dropType === 'skill') {
        return packageKind === 'skill'
            || (packageKind !== 'agent' && Number(counts.skills || 0) > 0)
    }
    if (dropType === 'mcp') {
        return packageKind === 'mcp'
    }
    return false
}

function primitivePathName(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
        return null
    }
    const parts = value.split('/').filter(Boolean)
    const last = parts.pop()
    if (!last) return null
    if (last.toLowerCase() === 'skill.md') {
        return parts.pop() || null
    }
    return last
        .replace(/\.instructions\.md$/i, '')
        .replace(/\.agent\.md$/i, '')
        .replace(/\.md$/i, '')
}

function manifestEntryPath(entry: unknown) {
    if (typeof entry === 'string') {
        return entry
    }
    if (isRecord(entry) && typeof entry.path === 'string') {
        return entry.path
    }
    return null
}

function manifestSkillName(manifest: ApmPackageManifest, fallback: string) {
    const entries = manifest.skills
    const first = Array.isArray(entries) ? entries[0] : null
    const directName = isRecord(first) && typeof first.name === 'string' && first.name.trim()
        ? first.name.trim()
        : null
    if (directName) {
        return directName
    }

    const pathName = primitivePathName(manifestEntryPath(first))
    return pathName || fallback
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
        if (primitive.packageKind === 'instruction') {
            showDropWarning('Instruction packages are standalone project/file rules. Open them from Packages or export them through Export.')
            return null
        }
        showDropWarning('Only APM packages with an Agent primitive can be dropped onto the canvas. Use Skills and MCP from Packages for agent attachments.')
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
        urn: packageUrn(scope, result.packageId || packageId),
        source: scope,
        name: agentName,
        description: agent?.description
            || (typeof manifest.description === 'string' ? manifest.description : undefined)
            || primitive.description,
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

export async function resolveApmPackagePrimitiveForAgentDrop(
    primitive: DragPrimitive,
    dropType: string | undefined,
    showDropWarning: (message: string) => void,
): Promise<DragPrimitive | null> {
    if (dropType !== 'skill' && dropType !== 'mcp') {
        return null
    }

    if (!packageSupportsDropType(primitive, dropType)) {
        return null
    }

    const packageId = primitive.packageId || primitive.name
    if (!packageId) {
        showDropWarning('This APM package is missing a package id.')
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
    const resolvedPackageId = result.packageId || packageId
    const fallbackName = primitive.name || manifest.name || resolvedPackageId

    if (dropType === 'mcp') {
        const mcpServerNames = mcpServerNamesFromApmPackage(result, manifest['x-apm']?.agent || null)
        const firstServerName = mcpServerNames[0]
        if (!firstServerName) {
            showDropWarning(`APM package "${fallbackName}" does not define MCP servers.`)
            return null
        }
        return {
            kind: 'mcp',
            urn: packageUrn(scope, resolvedPackageId),
            source: scope,
            name: firstServerName,
            description: typeof manifest.description === 'string' ? manifest.description : primitive.description,
            mcpServerNames,
            mcpConfig: apmPackageMcpConfig(result, mcpServerNames),
        }
    }

    return {
        kind: dropType,
        urn: packageUrn(scope, resolvedPackageId),
        source: scope,
        name: manifestSkillName(manifest, fallbackName),
        description: typeof manifest.description === 'string' ? manifest.description : primitive.description,
        author: typeof manifest.author === 'string' && manifest.author.trim()
            ? manifest.author
            : scope,
    }
}
