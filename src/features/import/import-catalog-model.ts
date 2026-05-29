import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportFormat,
    ApmPackageScope,
} from '../../../shared/apm-contracts'

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
    { name: 'Awesome Copilot', repo: 'github/awesome-copilot' },
    { name: 'Addy Agent Skills', repo: 'addyosmani/agent-skills' },
    { name: 'Vercel Skills', repo: 'vercel-labs/skills' },
    { name: 'Vercel Agent Skills', repo: 'vercel-labs/agent-skills' },
    { name: 'Microsoft Skills', repo: 'microsoft/skills' },
    { name: 'Claude Subagents', repo: 'VoltAgent/awesome-claude-code-subagents' },
    { name: 'Microsoft APM', repo: 'microsoft/apm' },
    { name: 'Agent Skills Index', repo: 'VoltAgent/awesome-agent-skills' },
]

export function scopeLabel(scope: ImportScope) {
    return scope === 'user' ? 'User Scope' : 'Workspace'
}

export function candidateInstallKey(scope: ImportScope, candidateId: string) {
    return `${scope}:${candidateId}`
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
