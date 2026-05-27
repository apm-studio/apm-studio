// Search, filter, and haystack utilities for the Packages

import type { InstalledKind, LocalSection, PrimitiveKind, SourceFilter } from './asset-library-utils'

type SearchableAsset = {
    name?: string
    author?: string
    urn?: string
    description?: string
    tags?: string[]
    source?: string
}
type SearchableModel = {
    name?: string
    id?: string
    provider?: string
    providerName?: string
    toolCall?: boolean
    attachment?: boolean
}
type SearchableMcp = {
    name?: string
    status?: string
    tools?: Array<{ name: string; description?: string }>
}

export function buildSearchHaystack(asset: SearchableAsset): string {
    return [
        asset.name,
        asset.author,
        asset.urn,
        asset.description,
        ...(Array.isArray(asset.tags) ? asset.tags : []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function buildModelHaystack(model: SearchableModel): string {
    return [
        model.name,
        model.id,
        model.provider,
        model.providerName,
        model.toolCall ? 'tool-call' : '',
        model.attachment ? 'attachment' : '',
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function buildMcpHaystack(mcp: SearchableMcp): string {
    return [
        mcp.name,
        mcp.status,
        ...(Array.isArray(mcp.tools) ? mcp.tools.map((tool) => `${tool.name} ${tool.description || ''}`) : []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function filterInstalledAssets<T extends SearchableAsset>(
    assets: T[],
    sourceFilter: SourceFilter,
    queryText: string,
) {
    return assets
        .filter((asset) => sourceFilter === 'all' ? true : asset.source === sourceFilter)
        .filter((asset) => !queryText || buildSearchHaystack(asset).includes(queryText))
}

export function labelForInstalledKind(kind: InstalledKind) {
    if (kind === 'tal') return 'Instruction'
    if (kind === 'dance') return 'Skill'
    if (kind === 'performer') return 'Agent'
    return 'Team'
}

export function placeholderForLocalSection(
    localSection: LocalSection,
    primitiveKind?: PrimitiveKind,
) {
    if (localSection === 'packages') {
        return 'package, primitive, apm.yml path...'
    }

    if (localSection === 'primitives') {
        if (primitiveKind === 'mcp') {
            return 'mcp server, tool, status...'
        }
        return 'primitive, urn, author, tag...'
    }

    return 'model, provider, capability...'
}

export function authoringNoteForInstalledKind(installedKind: InstalledKind) {
    if (installedKind === 'tal' || installedKind === 'dance') {
        return 'Drag & drop onto an agent, or edit a draft primitive.'
    }
    if (installedKind === 'performer') {
        return 'Drag & drop onto the canvas to create an agent.'
    }
    return 'Drag & drop onto the canvas to create a new team.'
}
