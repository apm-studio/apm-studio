// Search and haystack utilities for the Packages drawer

import type { LocalSection } from './package-library-utils'

type SearchablePrimitive = {
    name?: string
    author?: string
    urn?: string
    description?: string
    tags?: string[]
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

export function buildSearchHaystack(item: SearchablePrimitive): string {
    return [
        item.name,
        item.author,
        item.urn,
        item.description,
        ...(Array.isArray(item.tags) ? item.tags : []),
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

export function placeholderForLocalSection(
    localSection: LocalSection,
) {
    if (localSection === 'packages') {
        return 'package, primitive, apm.yml path...'
    }

    if (localSection === 'mcp') {
        return 'mcp server, tool, status...'
    }

    return 'model, provider, capability...'
}
