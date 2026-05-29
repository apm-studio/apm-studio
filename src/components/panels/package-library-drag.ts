import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { McpServerSummary } from '../../../shared/opencode-contracts'
import type { PackagePrimitive, ScopedApmPackageSummary } from './package-panel-types'

// Drag payload builders for the Packages

export function buildPackagePrimitiveDragPayload(item: PackagePrimitive) {
    if (item.kind === 'agent') {
        if (item.source === 'draft') {
            return {
                kind: 'agent',
                urn: item.urn,
                draftId: item.draftId,
                source: item.source,
                name: item.name,
                author: item.author,
                draftContent: item.draftContent ?? undefined,
            }
        }
        return {
            kind: 'agent',
            urn: item.urn,
            name: item.name,
            author: item.author,
            source: item.source,
            instructionUrn: item.instructionUrn || null,
            skillUrns: Array.isArray(item.skillUrns) ? item.skillUrns : [],
            model: item.model || null,
            modelVariant: item.modelVariant || null,
            mcpConfig: item.mcpConfig || null,
            declaredMcpServerNames: Array.isArray(item.declaredMcpServerNames) ? item.declaredMcpServerNames : [],
            matchedMcpServerNames: Array.isArray(item.matchedMcpServerNames) ? item.matchedMcpServerNames : [],
            missingMcpServerNames: Array.isArray(item.missingMcpServerNames) ? item.missingMcpServerNames : [],
        }
    }

    if (item.kind === 'team') {
        if (item.source === 'draft') {
            return {
                kind: 'team',
                urn: item.urn,
                draftId: item.draftId,
                source: item.source,
                name: item.name,
                author: item.author,
                draftContent: item.draftContent ?? undefined,
            }
        }
        return {
            kind: 'team',
            urn: item.urn,
            slug: item.slug,
            name: item.name,
            author: item.author,
            source: item.source,
            description: item.description || '',
            teamRules: Array.isArray(item.teamRules) ? item.teamRules : [],
            participants: Array.isArray(item.participants) ? item.participants : [],
            relations: Array.isArray(item.relations) ? item.relations : [],
        }
    }

    if (item.source === 'draft') {
        return {
            kind: item.kind,
            urn: item.urn,
            draftId: item.draftId,
            source: item.source,
            name: item.name,
            author: item.author,
        }
    }

    return {
        kind: item.kind,
        urn: item.urn,
        slug: item.slug,
        name: item.name,
        author: item.author,
        source: item.source,
    }
}

export function buildModelDragPayload(model: RuntimeModelCatalogEntry) {
    return {
        kind: 'model',
        provider: model.provider,
        providerName: model.providerName || model.provider,
        modelId: model.id,
        name: model.name || model.id,
        connected: !!model.connected,
    }
}

export function buildMcpDragPayload(mcp: McpServerSummary) {
    return {
        kind: 'mcp',
        name: mcp.name,
        status: mcp.status,
        tools: Array.isArray(mcp.tools) ? mcp.tools : [],
        resources: Array.isArray(mcp.resources) ? mcp.resources : [],
    }
}

export function buildApmPackageDragPayload(pkg: ScopedApmPackageSummary) {
    const title = pkg.agentName || pkg.name || pkg.packageId
    return {
        kind: 'apm-package',
        urn: `apm-package/${pkg.scope}/${pkg.packageId}`,
        packageId: pkg.packageId,
        packageKind: pkg.kind,
        scope: pkg.scope,
        source: pkg.scope,
        name: title,
        label: title,
        description: pkg.description || '',
        agentName: pkg.agentName,
        manifestPath: pkg.manifestPath,
        packageRoot: pkg.microsoftApm?.packageRoot,
        primitiveCounts: pkg.microsoftApm?.primitiveCounts,
    }
}
