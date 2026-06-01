import type { DraftPrimitive } from './primitive-types'
// Agent utilities barrel re-export.
// This file serves as the public API for agent-related utilities.



export {
    packageLibraryItemFromUrn,
    primitiveRefKey,
    primitiveRefKeys,
    buildTeamPrimitivePayload,
    buildPackageLibraryItemMap,
    buildAutoMcpBindingMap,
    buildMcpServerMap,
    isSamePrimitiveRef,
    normalizeAgentPrimitiveInput,
    registryPrimitiveRef,
    registryPrimitiveRefs,
    registryUrnFromRef,
    registryUrnsFromRefs,
    resolveMappedMcpServerNames,
    resolveAgentPresentation,
    sanitizeMcpBindingMap,
    slugifyPrimitiveName,
    unresolvedDeclaredMcpServerNames,
} from './agents-package'

export {
    modelConfigFromPrimitiveValue,
    hasModelConfig,
    resolveImportedModel,
    normalizePrimitiveModelForStudio,
    normalizePrimitiveMcpForStudio,
    modelConfigToPrimitiveValue,
} from './agents-model'

export {
    AGENT_DEFAULT_HEIGHT,
    AGENT_DEFAULT_WIDTH,
    createAgentNode,
    createAgentNodeFromPrimitive,
    cloneAgentNode,
} from './agents-node'

export {
    resolveAgentRuntimeId,
    resolveAgentRuntimeConfig,
    buildAgentConfigHash,
} from './agents-runtime'

export function draftTextContent(draft: DraftPrimitive | null | undefined): string {
    if (!draft) {
        return ''
    }
    if (typeof draft.content === 'string') {
        return draft.content
    }
    return ''
}

export function draftTags(draft: DraftPrimitive | null | undefined): string[] {
    return Array.isArray(draft?.tags)
        ? draft.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        : []
}
