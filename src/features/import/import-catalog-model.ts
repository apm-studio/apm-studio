import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportFormat,
    ApmGitHubImportRequest,
    ApmPackageScope,
} from '../../../shared/apm-contracts'
import type {
    RegistryImportFormat,
    RegistryListing,
} from '../../../shared/registry-contracts'

export type ImportScope = ApmPackageScope
export type ResultKindFilter = ApmGitHubImportCandidate['kind'] | 'all'

export const IMPORT_FORMATS: Array<{ value: ApmGitHubImportFormat; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'apm', label: 'APM' },
    { value: 'skill-md', label: 'SKILL.md' },
    { value: 'claude-md', label: 'Claude md' },
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
]

export const CURATED_GITHUB_REPOS: Array<{ name: string; repo: string }> = [
    { name: 'Addy Agent Skills', repo: 'addyosmani/agent-skills' },
    { name: 'wshobson Agents', repo: 'wshobson/agents' },
    { name: 'Awesome Copilot', repo: 'github/awesome-copilot' },
    { name: 'Vercel Agent Skills', repo: 'vercel-labs/agent-skills' },
    { name: 'Agent Skills Index', repo: 'VoltAgent/awesome-agent-skills' },
    { name: 'Claude Subagents', repo: 'VoltAgent/awesome-claude-code-subagents' },
    { name: 'Claude Skills', repo: 'alirezarezvani/claude-skills' },
    { name: 'Composio Orchestrator', repo: 'ComposioHQ/agent-orchestrator' },
    { name: 'Vibe Coding Template', repo: 'KhazP/vibe-coding-prompt-template' },
    { name: 'Microsoft Skills', repo: 'microsoft/skills' },
    { name: 'Claude Sub Agents', repo: 'lst97/claude-code-sub-agents' },
    { name: 'Claude Code Agents', repo: 'hesreallyhim/awesome-claude-code-agents' },
]

export function scopeLabel(scope: ImportScope) {
    return scope === 'user' ? 'User' : 'Workspace'
}

export function candidateInstallKey(scope: ImportScope, candidateId: string) {
    return `${scope}:${candidateId}`
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
    'codex-toml': 'codex-toml',
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

export function filterImportCandidates(
    candidates: ApmGitHubImportCandidate[],
    query: string,
    kind: ResultKindFilter,
) {
    const normalizedQuery = query.trim().toLowerCase()
    return candidates.filter((candidate) => {
        if (kind !== 'all' && candidate.kind !== kind) return false
        if (!normalizedQuery) return true
        return [
            candidate.name,
            candidate.description,
            candidate.kind,
            candidate.format,
            candidate.sourcePath,
            candidate.packageId,
            ...candidate.targets,
        ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
}
