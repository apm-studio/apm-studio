import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportFormat,
    ApmGitHubImportRequest,
    ApmPackageScope,
} from '../../../shared/apm-contracts'
import type {
    RegistryImportFormat,
    RegistryListing,
    RegistryListingKind,
} from '../../../shared/registry-contracts'

export type ImportScope = ApmPackageScope
export type ResultKindFilter = ApmGitHubImportCandidate['kind'] | RegistryListingKind | 'all'
export type ResultElementFilter =
    | 'all'
    | 'agents'
    | 'instructions'
    | 'skills'
    | 'prompts'
    | 'commands'
    | 'hooks'
    | 'mcp'

export interface ImportSearchHistoryEntry {
    source: string
    format: ApmGitHubImportFormat
    searchedAt: string
}

export const IMPORT_SEARCH_HISTORY_LIMIT = 8
export const IMPORT_SEARCH_HISTORY_STORAGE_KEY = 'apm-studio:import-search-history'

export const IMPORT_FORMATS: Array<{ value: ApmGitHubImportFormat; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'apm', label: 'APM' },
    { value: 'skill-md', label: 'SKILL.md' },
    { value: 'claude-md', label: 'Claude md' },
    { value: 'claude-settings', label: 'Claude hooks' },
    { value: 'target-native', label: 'Target native' },
    { value: 'codex-toml', label: 'Codex TOML' },
    { value: 'instruction-md', label: 'Instructions' },
    { value: 'mcp-config', label: 'MCP config' },
]

export const RESULT_KIND_FILTERS: Array<{ value: ResultKindFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'package', label: 'Packages' },
    { value: 'agent', label: 'Agents' },
    { value: 'skill', label: 'Skills' },
    { value: 'instruction', label: 'Instructions' },
    { value: 'mcp', label: 'MCP' },
    { value: 'team', label: 'Teams' },
    { value: 'collection', label: 'Collections' },
]

export const RESULT_ELEMENT_FILTERS: Array<{ value: ResultElementFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'agents', label: 'Agents' },
    { value: 'instructions', label: 'Instructions' },
    { value: 'skills', label: 'Skills' },
    { value: 'prompts', label: 'Prompts' },
    { value: 'commands', label: 'Commands' },
    { value: 'hooks', label: 'Hooks' },
    { value: 'mcp', label: 'MCP' },
]

export const CURATED_GITHUB_REPOS: Array<{ name: string; repo: string }> = [
    { name: 'Anthropic Skills', repo: 'anthropics/skills' },
    { name: 'Addy Agent Skills', repo: 'addyosmani/agent-skills' },
    { name: 'wshobson Agents', repo: 'wshobson/agents' },
    { name: 'Vercel Agent Skills', repo: 'vercel-labs/agent-skills' },
    { name: 'Claude Subagents', repo: 'VoltAgent/awesome-claude-code-subagents' },
    { name: 'Codex Subagents', repo: 'VoltAgent/awesome-codex-subagents' },
    { name: 'Hooks Mastery', repo: 'disler/claude-code-hooks-mastery' },
    { name: 'Claude Spellbook', repo: 'kid-sid/claude-spellbook' },
    { name: 'Copilot Assets', repo: 'PlagueHO/github-copilot-assets-library' },
    { name: 'SuperClaude Plugin', repo: 'SuperClaude-Org/SuperClaude_Plugin' },
    { name: 'Cursor Prompts', repo: 'DVC2/cursor_prompts' },
    { name: 'Windsurf Rules', repo: 'kinopeee/windsurf-antigravity-rules' },
]

export function importFormatLabel(format: ApmGitHubImportFormat) {
    return IMPORT_FORMATS.find((entry) => entry.value === format)?.label || 'Auto'
}

function isImportFormat(value: unknown): value is ApmGitHubImportFormat {
    return typeof value === 'string' && IMPORT_FORMATS.some((entry) => entry.value === value)
}

function browserLocalStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
}

function normalizeImportSearchHistoryEntry(value: unknown): ImportSearchHistoryEntry | null {
    if (!value || typeof value !== 'object') return null
    const record = value as Partial<ImportSearchHistoryEntry>
    const source = typeof record.source === 'string' ? record.source.trim() : ''
    if (!source) return null
    return {
        source,
        format: isImportFormat(record.format) ? record.format : 'auto',
        searchedAt: typeof record.searchedAt === 'string' ? record.searchedAt : '',
    }
}

export function normalizeImportSearchHistory(value: unknown): ImportSearchHistoryEntry[] {
    if (!Array.isArray(value)) return []
    const seenSources = new Set<string>()
    const entries: ImportSearchHistoryEntry[] = []
    for (const item of value) {
        const entry = normalizeImportSearchHistoryEntry(item)
        if (!entry) continue
        const key = entry.source.toLowerCase()
        if (seenSources.has(key)) continue
        seenSources.add(key)
        entries.push(entry)
        if (entries.length >= IMPORT_SEARCH_HISTORY_LIMIT) break
    }
    return entries
}

export function readImportSearchHistory(
    storage: Pick<Storage, 'getItem'> | null = browserLocalStorage(),
): ImportSearchHistoryEntry[] {
    if (!storage) return []
    try {
        return normalizeImportSearchHistory(JSON.parse(storage.getItem(IMPORT_SEARCH_HISTORY_STORAGE_KEY) || '[]'))
    } catch {
        return []
    }
}

export function writeImportSearchHistory(
    entries: ImportSearchHistoryEntry[],
    storage: Pick<Storage, 'setItem'> | null = browserLocalStorage(),
) {
    if (!storage) return
    try {
        storage.setItem(IMPORT_SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(entries))
    } catch {
        // Search history is a UI convenience and should never block import.
    }
}

export function addImportSearchHistoryEntry(
    current: ImportSearchHistoryEntry[],
    source: string,
    format: ApmGitHubImportFormat,
    searchedAt = new Date().toISOString(),
) {
    const normalizedSource = source.trim()
    if (!normalizedSource) return current
    const sourceKey = normalizedSource.toLowerCase()
    return [
        { source: normalizedSource, format, searchedAt },
        ...current.filter((entry) => entry.source.toLowerCase() !== sourceKey),
    ].slice(0, IMPORT_SEARCH_HISTORY_LIMIT)
}

export function scopeLabel(scope: ImportScope) {
    return scope === 'user' ? 'User' : 'Workspace'
}

export function importInstallTargetKey(scope: ImportScope, workspacePath: string | null | undefined) {
    return scope === 'user' ? 'user' : `workspace:${workspacePath?.trim() || 'none'}`
}

export function candidateInstallKey(targetKey: string, packageId: string) {
    return `${targetKey}:${packageId}`
}

export function candidateIsInstalled(
    candidate: ApmGitHubImportCandidate,
    installedPackageIds: ReadonlySet<string>,
    optimisticInstalledPackageKeys: ReadonlySet<string>,
    targetKey: string,
) {
    return installedPackageIds.has(candidate.packageId)
        || optimisticInstalledPackageKeys.has(candidateInstallKey(targetKey, candidate.packageId))
}

export type ImportCandidateBulkSelectionAction = 'select' | 'clear'

export function selectableImportCandidateIds(
    candidates: ApmGitHubImportCandidate[],
    installedPackageIds: ReadonlySet<string>,
    optimisticInstalledPackageKeys: ReadonlySet<string>,
    targetKey: string,
) {
    return candidates
        .filter((candidate) => !candidateIsInstalled(
            candidate,
            installedPackageIds,
            optimisticInstalledPackageKeys,
            targetKey,
        ))
        .map((candidate) => candidate.id)
}

export function countSelectedImportCandidates(
    selectedCandidateIds: ReadonlySet<string>,
    candidateIds: string[],
) {
    return candidateIds.filter((candidateId) => selectedCandidateIds.has(candidateId)).length
}

export function updateImportCandidateSelection(
    currentSelection: ReadonlySet<string>,
    candidateIds: string[],
    action: ImportCandidateBulkSelectionAction,
) {
    const nextSelection = new Set(currentSelection)
    for (const candidateId of candidateIds) {
        if (action === 'select') {
            nextSelection.add(candidateId)
        } else {
            nextSelection.delete(candidateId)
        }
    }
    return nextSelection
}

function normalizeRepoSlug(value: string) {
    return value
        .replace(/\.git$/i, '')
        .split('/')
        .filter(Boolean)
        .slice(0, 2)
        .join('/')
}

export function githubSourceUrl(source: string | null | undefined) {
    const rawSource = source?.trim()
    if (!rawSource) return null

    const sshMatch = rawSource.match(/^git@github\.com:([^/\s]+\/[^/\s#?]+)(?:\.git)?(?:[#?].*)?$/i)
    if (sshMatch) {
        const repo = normalizeRepoSlug(sshMatch[1])
        return repo ? `https://github.com/${repo}` : null
    }

    try {
        const parsed = new URL(rawSource)
        const host = parsed.hostname.toLowerCase()
        if (host === 'github.com' || host === 'www.github.com') {
            const repo = normalizeRepoSlug(parsed.pathname)
            return repo ? `https://github.com/${repo}` : parsed.toString()
        }
        if (host === 'raw.githubusercontent.com') {
            const repo = normalizeRepoSlug(parsed.pathname)
            return repo ? `https://github.com/${repo}` : null
        }
    } catch {
        // Plain owner/repo sources are handled below.
    }

    const repo = normalizeRepoSlug(rawSource.split(/[?#]/)[0])
    return /^[^/\s]+\/[^/\s]+$/.test(repo) ? `https://github.com/${repo}` : null
}

const REGISTRY_IMPORT_FORMAT_MAP: Partial<Record<RegistryImportFormat, ApmGitHubImportFormat>> = {
    apm: 'apm',
    'skill-md': 'skill-md',
    'claude-md': 'claude-md',
    'claude-settings': 'claude-settings',
    'target-native': 'target-native',
    'codex-toml': 'codex-toml',
    'instruction-md': 'instruction-md',
    'mcp-config': 'mcp-config',
}

export function registryListingSource(listing: RegistryListing) {
    return listing.source.path
        ? `${listing.source.repo}/${listing.source.path}`
        : listing.source.repo
}

export function registryListingToGitHubImportRequest(listing: RegistryListing): ApmGitHubImportRequest | null {
    const format = REGISTRY_IMPORT_FORMAT_MAP[listing.importRecipe.format]
    if (!format) return null
    return {
        source: registryListingSource(listing),
        ref: listing.source.ref,
        format,
        limit: listing.source.path ? 1 : 24,
        registryListingId: listing.id,
    }
}

function matchesNormalizedQuery(values: Array<string | number | boolean | null | undefined>, normalizedQuery: string) {
    if (!normalizedQuery) return true
    return values.some((value) => `${value ?? ''}`.toLowerCase().includes(normalizedQuery))
}

const CANDIDATE_KIND_ELEMENT_MAP: Partial<Record<ApmGitHubImportCandidate['kind'], ResultElementFilter>> = {
    agent: 'agents',
    instruction: 'instructions',
    skill: 'skills',
    mcp: 'mcp',
}

function candidateHasElement(candidate: ApmGitHubImportCandidate, element: ResultElementFilter) {
    if (element === 'all') return true
    const count = candidate.primitiveCounts[element]
    if (typeof count === 'number' && count > 0) return true
    return CANDIDATE_KIND_ELEMENT_MAP[candidate.kind] === element
}

export function filterImportCandidates(
    candidates: ApmGitHubImportCandidate[],
    query: string,
    kind: ResultKindFilter,
    element: ResultElementFilter = 'all',
) {
    const normalizedQuery = query.trim().toLowerCase()
    return candidates.filter((candidate) => {
        if (kind !== 'all' && candidate.kind !== kind) return false
        if (!candidateHasElement(candidate, element)) return false
        return matchesNormalizedQuery([
            candidate.name,
            candidate.description,
            candidate.kind,
            candidate.format,
            candidate.sourcePath,
            candidate.packageId,
            ...RESULT_ELEMENT_FILTERS
                .filter((filter) => filter.value !== 'all' && candidateHasElement(candidate, filter.value))
                .map((filter) => filter.label),
            ...candidate.targets,
        ], normalizedQuery)
    })
}

function registryListingMatchesKind(listing: RegistryListing, kind: ResultKindFilter) {
    if (kind === 'all') return true
    if (listing.kind === kind) return true
    return kind === 'mcp' && listing.importRecipe.format === 'mcp-config'
}

function registryListingHasElement(listing: RegistryListing, element: ResultElementFilter) {
    if (element === 'all') return true
    if (element === 'agents') return listing.kind === 'agent'
    if (element === 'instructions') return listing.kind === 'instruction'
    if (element === 'skills') return listing.kind === 'skill'
    if (element === 'mcp') return listing.importRecipe.format === 'mcp-config'
    return false
}

export function filterRegistryListings(
    listings: RegistryListing[],
    query: string,
    kind: ResultKindFilter,
    element: ResultElementFilter = 'all',
) {
    const normalizedQuery = query.trim().toLowerCase()
    return listings.filter((listing) => {
        if (!registryListingMatchesKind(listing, kind)) return false
        if (!registryListingHasElement(listing, element)) return false
        return matchesNormalizedQuery([
            listing.name,
            listing.summary,
            listing.description,
            listing.kind,
            listing.slug,
            listing.source.repo,
            listing.source.path,
            listing.source.ref,
            listing.importRecipe.format,
            listing.importRecipe.adapter,
            listing.trust.level,
            listing.license,
            listing.status,
            listing.downloads,
            ...RESULT_ELEMENT_FILTERS
                .filter((filter) => filter.value !== 'all' && registryListingHasElement(listing, filter.value))
                .map((filter) => filter.label),
            ...listing.tags,
            ...Object.keys(listing.targets),
            ...Object.values(listing.targets),
        ], normalizedQuery)
    })
}
