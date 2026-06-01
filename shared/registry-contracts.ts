export const REGISTRY_LISTING_KINDS = ['agent', 'skill', 'instruction', 'team', 'collection'] as const
export const REGISTRY_TARGET_IDS = ['codex', 'claude', 'gemini', 'opencode', 'cursor', 'windsurf'] as const
export const REGISTRY_TARGET_SUPPORT = ['native', 'transformable', 'unsupported'] as const
export const REGISTRY_TRUST_LEVELS = ['community', 'indexed', 'verified', 'curated'] as const
export const REGISTRY_IMPORT_FORMATS = [
    'apm',
    'codex-toml',
    'skill-md',
    'claude-md',
    'instruction-md',
    'mcp-config',
    'cursor-rules',
    'opencode-agent',
    'custom',
] as const

export type RegistryListingKind = typeof REGISTRY_LISTING_KINDS[number]
export type RegistryTargetId = typeof REGISTRY_TARGET_IDS[number]
export type RegistryTargetSupport = typeof REGISTRY_TARGET_SUPPORT[number]
export type RegistryTrustLevel = typeof REGISTRY_TRUST_LEVELS[number]
export type RegistryImportFormat = typeof REGISTRY_IMPORT_FORMATS[number]

export type RegistryGithubSourceRef = {
    type: 'github'
    repo: string
    ref: string
    path?: string
    resolvedCommitSha?: string
}

export type RegistryImportRecipe = {
    format: RegistryImportFormat
    adapter: string
    include?: string[]
}

export type RegistryListing = {
    id: string
    slug: string
    name: string
    summary: string
    description?: string
    kind: RegistryListingKind
    source: RegistryGithubSourceRef
    importRecipe: RegistryImportRecipe
    targets: Partial<Record<RegistryTargetId, RegistryTargetSupport>>
    tags: string[]
    license?: string
    trust: {
        level: RegistryTrustLevel
        verifiedSource: boolean
        lastIndexedAt?: string
        contentHash?: string
        warnings?: string[]
    }
    status: 'active' | 'pending' | 'hidden' | 'deprecated'
    downloads?: number
    sourceDownloads?: number
    createdAt: string
    updatedAt: string
}

export type RegistryCatalogResponse = {
    listings: RegistryListing[]
    nextCursor?: string
}

export type RegistryDownloadEventRequest = {
    listingId?: string
    source: RegistryGithubSourceRef
    importRecipe?: RegistryImportRecipe
    target?: RegistryTargetId
}

export type RegistryDownloadEventResponse = {
    ok: true
}
