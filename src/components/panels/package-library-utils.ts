// Pure utility functions and types extracted from PackageLibrary.tsx
// This file serves as a barrel re-export for the split modules.

import { primitiveUrnDisplayName } from '../../lib/primitive-urn'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { McpServerSummary } from '../../../shared/opencode-contracts'
import type { PackagePanelItem, PackagePrimitive, McpPanelItem, ModelPanelItem } from './package-panel-types'
export {
    ALL_MODEL_PROVIDER_FILTER,
    type ModelProviderFilter,
    modelProviderFilterForProvider,
} from '../../lib/runtime-models'

export type PackagePrimitiveKind = 'agent' | 'instruction' | 'skill' | 'team'
export type PrimitiveKind = PackagePrimitiveKind | 'mcp'
export type SourceFilter = 'all' | 'user' | 'workspace'
export type LocalSection = 'packages' | 'mcp' | 'models'
export type PackagePrimitiveSection = 'agents' | 'instructions' | 'skills' | 'mcp'

export const PACKAGE_PRIMITIVE_KIND_ORDER: PackagePrimitiveKind[] = ['agent', 'instruction', 'skill', 'team']
export const PACKAGE_PRIMITIVE_SECTIONS: PackagePrimitiveSection[] = ['agents', 'instructions', 'skills', 'mcp']

export function displayUrn(urn: string) {
    return primitiveUrnDisplayName(urn)
}

export function normalizeAuthor(author?: string) {
    if (!author) return ''
    return author.startsWith('@') ? author : `@${author}`
}

export function isPackagePrimitiveKind(kind: string | null | undefined): kind is PackagePrimitiveKind {
    return kind === 'agent' || kind === 'instruction' || kind === 'skill' || kind === 'team'
}

type PrimitiveUrnInput = {
    urn?: string
    kind?: string
    name?: string
    author?: string
    slug?: string
} | null | undefined

type PrimitiveSelectionKeyInput = {
    urn?: string
    kind?: string
    name?: string
    author?: string
    slug?: string
    provider?: string
    id?: string
    modelId?: string
} | null | undefined

export function getPrimitiveUrn(item: PrimitiveUrnInput): string | null {
    if (!item) return null
    if (typeof item.urn === 'string' && item.urn.length > 0) {
        return item.urn
    }
    if (!isPackagePrimitiveKind(item.kind) || !item.name || !item.author) {
        return null
    }
    return `${item.kind}/${normalizeAuthor(item.author)}/${item.slug || item.name}`
}

export function getPackagePanelItemKey(item: PrimitiveSelectionKeyInput): string {
    if (!item) return ''
    const urn = getPrimitiveUrn(item)
    if (urn) return urn
    if (item.kind === 'model') {
        return `model:${item.provider}:${item.id || item.modelId || item.name}`
    }
    if (item.kind === 'mcp') {
        return `mcp:${item.name}`
    }
    return `${item.kind}:${item.name}:${item.author || ''}`
}

export function resolveSelectedPackagePanelItem(
    selectedItem: PackagePanelItem | null,
    options: {
        packagePrimitives?: PackagePrimitive[]
        models?: RuntimeModelCatalogEntry[]
        mcps?: McpServerSummary[]
    },
): PackagePanelItem | null {
    if (!selectedItem) return null

    const selectedKey = getPackagePanelItemKey(selectedItem)
    if (!selectedKey) return selectedItem

    const primitiveMatch = (options.packagePrimitives || []).find((item) => getPackagePanelItemKey(item) === selectedKey)
    if (primitiveMatch) {
        return primitiveMatch
    }

    const modelMatch = (options.models || []).find((model) => (
        getPackagePanelItemKey({ kind: 'model', ...model }) === selectedKey
    ))
    if (modelMatch) {
        return {
            ...modelMatch,
            kind: 'model',
            name: modelMatch.name || modelMatch.id,
        } satisfies ModelPanelItem
    }

    const mcpMatch = (options.mcps || []).find((mcp) => (
        getPackagePanelItemKey({ kind: 'mcp', ...mcp }) === selectedKey
    ))
    if (mcpMatch) {
        return {
            ...mcpMatch,
            kind: 'mcp',
        } satisfies McpPanelItem
    }

    return selectedItem
}

// Re-export from split modules
export {
    buildSearchHaystack,
    buildModelHaystack,
    buildMcpHaystack,
    placeholderForLocalSection,
    placeholderForPrimitiveSection,
} from './package-library-search'

export {
    buildPackagePrimitiveDragPayload,
    buildModelDragPayload,
    buildMcpDragPayload,
    buildApmPackageDragPayload,
} from './package-library-drag'

export {
    MAX_MODELS_PER_PROVIDER,
    classifyModelProvider,
    labelForModelProviderFilter,
    scoreModel,
    groupModels,
} from './package-library-models'

export {
    buildDraftPackageCards,
    buildAuthoringPayloadFromPrimitive,
} from './package-library-authoring'
