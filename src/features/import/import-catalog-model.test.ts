import { describe, expect, it } from 'vitest'
import type { ApmGitHubImportCandidate } from '../../../shared/apm-contracts'
import {
    addImportSearchHistoryEntry,
    candidateInstallKey,
    candidateIsInstalled,
    CURATED_GITHUB_REPOS,
    countSelectedImportCandidates,
    filterImportCandidates,
    filterRegistryListings,
    githubSourceUrl,
    importInstallTargetKey,
    IMPORT_SEARCH_HISTORY_LIMIT,
    IMPORT_SEARCH_HISTORY_STORAGE_KEY,
    normalizeImportSearchHistory,
    readImportSearchHistory,
    registryListingSource,
    registryListingToGitHubImportRequest,
    selectableImportCandidateIds,
    scopeLabel,
    updateImportCandidateSelection,
    writeImportSearchHistory,
} from './import-catalog-model'
import type { RegistryListing } from '../../../shared/registry-contracts'

function candidate(overrides: Partial<ApmGitHubImportCandidate> & { id: string; name: string; kind: ApmGitHubImportCandidate['kind'] }): ApmGitHubImportCandidate {
    return {
        id: overrides.id,
        name: overrides.name,
        description: overrides.description || '',
        kind: overrides.kind,
        format: overrides.format || 'apm',
        sourcePath: overrides.sourcePath || `${overrides.name}.md`,
        packageId: overrides.packageId || overrides.id,
        targets: overrides.targets || ['codex'],
        primitiveCounts: overrides.primitiveCounts || {},
    }
}

function listing(overrides: Partial<RegistryListing> & { id: string; name: string; kind: RegistryListing['kind'] }): RegistryListing {
    return {
        id: overrides.id,
        slug: overrides.slug || overrides.id,
        name: overrides.name,
        summary: overrides.summary || '',
        kind: overrides.kind,
        source: overrides.source || {
            type: 'github',
            repo: 'acme/apm-packages',
            ref: 'main',
        },
        importRecipe: overrides.importRecipe || {
            format: 'apm',
            adapter: 'apm@1',
        },
        targets: overrides.targets || { codex: 'native' },
        tags: overrides.tags || [],
        trust: overrides.trust || {
            level: 'indexed',
            verifiedSource: false,
        },
        status: overrides.status || 'active',
        createdAt: overrides.createdAt || '2026-05-31T00:00:00.000Z',
        updatedAt: overrides.updatedAt || '2026-05-31T00:00:00.000Z',
        ...(overrides.description ? { description: overrides.description } : {}),
        ...(overrides.license ? { license: overrides.license } : {}),
        ...(overrides.downloads !== undefined ? { downloads: overrides.downloads } : {}),
    }
}

describe('import catalog model', () => {
    it('filters candidates by kind and searchable metadata', () => {
        const candidates = [
            candidate({
                id: 'agent-1',
                name: 'Code Reviewer',
                kind: 'agent',
                description: 'Review code for bugs',
                sourcePath: 'agents/reviewer.md',
                targets: ['codex', 'claude'],
            }),
            candidate({
                id: 'skill-1',
                name: 'Docx Writer',
                kind: 'skill',
                format: 'skill-md',
                sourcePath: 'skills/docx/SKILL.md',
            }),
            candidate({
                id: 'mcp-1',
                name: 'Filesystem',
                kind: 'mcp',
                format: 'mcp-config',
                sourcePath: 'mcp.json',
            }),
        ]

        expect(filterImportCandidates(candidates, 'claude', 'all').map((entry) => entry.id)).toEqual(['agent-1'])
        expect(filterImportCandidates(candidates, 'skill.md', 'skill').map((entry) => entry.id)).toEqual(['skill-1'])
        expect(filterImportCandidates(candidates, 'review', 'skill')).toEqual([])
    })

    it('filters candidates by APM element using primitive counts and kind fallbacks', () => {
        const candidates = [
            candidate({
                id: 'package-1',
                name: 'Mixed Package',
                kind: 'package',
                primitiveCounts: { agents: 1, skills: 2, prompts: 1 },
            }),
            candidate({
                id: 'skill-1',
                name: 'Standalone Skill',
                kind: 'skill',
                primitiveCounts: {},
            }),
            candidate({
                id: 'mcp-1',
                name: 'Filesystem',
                kind: 'mcp',
                format: 'mcp-config',
                primitiveCounts: {},
            }),
        ]

        expect(filterImportCandidates(candidates, '', 'all', 'agents').map((entry) => entry.id)).toEqual(['package-1'])
        expect(filterImportCandidates(candidates, '', 'all', 'skills').map((entry) => entry.id)).toEqual(['package-1', 'skill-1'])
        expect(filterImportCandidates(candidates, '', 'package', 'skills').map((entry) => entry.id)).toEqual(['package-1'])
        expect(filterImportCandidates(candidates, '', 'all', 'mcp').map((entry) => entry.id)).toEqual(['mcp-1'])
        expect(filterImportCandidates(candidates, '', 'all', 'commands')).toEqual([])
    })

    it('filters registry listings by kind and searchable metadata', () => {
        const listings = [
            listing({
                id: 'reviewer',
                name: 'Reviewer',
                kind: 'agent',
                summary: 'Code review agent',
                tags: ['review'],
                targets: { codex: 'native', claude: 'transformable' },
            }),
            listing({
                id: 'filesystem',
                name: 'Filesystem Server',
                kind: 'collection',
                summary: 'Local file tools',
                importRecipe: { format: 'mcp-config', adapter: 'mcp-config@1' },
                source: { type: 'github', repo: 'acme/mcp', ref: 'main', path: 'mcp.json' },
                tags: ['runtime'],
            }),
            listing({
                id: 'team',
                name: 'Research Team',
                kind: 'team',
                summary: 'Team workflow',
                tags: ['research'],
            }),
        ]

        expect(filterRegistryListings(listings, 'claude', 'all').map((entry) => entry.id)).toEqual(['reviewer'])
        expect(filterRegistryListings(listings, 'mcp.json', 'mcp').map((entry) => entry.id)).toEqual(['filesystem'])
        expect(filterRegistryListings(listings, 'research', 'team').map((entry) => entry.id)).toEqual(['team'])
        expect(filterRegistryListings(listings, 'review', 'skill')).toEqual([])
    })

    it('filters registry listings by APM element where listing metadata is available', () => {
        const listings = [
            listing({
                id: 'reviewer',
                name: 'Reviewer',
                kind: 'agent',
            }),
            listing({
                id: 'filesystem',
                name: 'Filesystem Server',
                kind: 'collection',
                importRecipe: { format: 'mcp-config', adapter: 'mcp-config@1' },
            }),
            listing({
                id: 'rules',
                name: 'Rules',
                kind: 'instruction',
            }),
        ]

        expect(filterRegistryListings(listings, '', 'all', 'agents').map((entry) => entry.id)).toEqual(['reviewer'])
        expect(filterRegistryListings(listings, '', 'all', 'instructions').map((entry) => entry.id)).toEqual(['rules'])
        expect(filterRegistryListings(listings, '', 'all', 'mcp').map((entry) => entry.id)).toEqual(['filesystem'])
        expect(filterRegistryListings(listings, '', 'all', 'hooks')).toEqual([])
    })

    it('keeps install labels and keys stable by scope', () => {
        expect(scopeLabel('workspace')).toBe('Workspace')
        expect(scopeLabel('user')).toBe('User')
        expect(importInstallTargetKey('user', '/tmp/a')).toBe('user')
        expect(importInstallTargetKey('workspace', '/tmp/a')).toBe('workspace:/tmp/a')
        expect(candidateInstallKey(importInstallTargetKey('workspace', '/tmp/a'), 'package-1')).toBe('workspace:/tmp/a:package-1')
    })

    it('detects installed candidates from the current install target only', () => {
        const writer = candidate({
            id: 'skill-1',
            name: 'Writer',
            kind: 'skill',
            packageId: 'writer-package',
        })
        const workspaceAKey = importInstallTargetKey('workspace', '/tmp/a')
        const workspaceBKey = importInstallTargetKey('workspace', '/tmp/b')
        const optimisticKeys = new Set([candidateInstallKey(workspaceAKey, writer.packageId)])

        expect(candidateIsInstalled(writer, new Set(), optimisticKeys, workspaceAKey)).toBe(true)
        expect(candidateIsInstalled(writer, new Set(), optimisticKeys, workspaceBKey)).toBe(false)
        expect(candidateIsInstalled(writer, new Set([writer.packageId]), new Set(), workspaceBKey)).toBe(true)
    })

    it('stores recent import searches with dedupe and a stable limit', () => {
        const entries = Array.from({ length: IMPORT_SEARCH_HISTORY_LIMIT + 2 }, (_, index) => (
            addImportSearchHistoryEntry([], `owner/repo-${index}`, 'auto', `2026-06-02T00:00:${index.toString().padStart(2, '0')}.000Z`)[0]
        ))
        const withLimit = entries.reduce((current, entry) => (
            addImportSearchHistoryEntry(current, entry.source, entry.format, entry.searchedAt)
        ), [] as typeof entries)
        const deduped = addImportSearchHistoryEntry(withLimit, 'OWNER/repo-2', 'target-native', '2026-06-02T01:00:00.000Z')

        expect(withLimit).toHaveLength(IMPORT_SEARCH_HISTORY_LIMIT)
        expect(deduped[0]).toMatchObject({ source: 'OWNER/repo-2', format: 'target-native' })
        expect(deduped.filter((entry) => entry.source.toLowerCase() === 'owner/repo-2')).toHaveLength(1)
    })

    it('normalizes stored import search history defensively', () => {
        expect(normalizeImportSearchHistory([
            { source: '  microsoft/apm  ', format: 'apm', searchedAt: '2026-06-02T00:00:00.000Z' },
            { source: 'microsoft/apm', format: 'target-native' },
            { source: 'broken', format: 'not-real' },
            { source: '   ', format: 'auto' },
            null,
        ])).toEqual([
            { source: 'microsoft/apm', format: 'apm', searchedAt: '2026-06-02T00:00:00.000Z' },
            { source: 'broken', format: 'auto', searchedAt: '' },
        ])
    })

    it('reads and writes import search history through storage', () => {
        const values = new Map<string, string>()
        const storage = {
            getItem: (key: string) => values.get(key) || null,
            setItem: (key: string, value: string) => values.set(key, value),
        }
        const entries = [
            { source: 'disler/claude-code-hooks-mastery', format: 'auto' as const, searchedAt: '2026-06-02T00:00:00.000Z' },
        ]

        writeImportSearchHistory(entries, storage)

        expect(values.has(IMPORT_SEARCH_HISTORY_STORAGE_KEY)).toBe(true)
        expect(readImportSearchHistory(storage)).toEqual(entries)
    })

    it('bulk-selects only visible installable candidates and clears them without touching hidden selections', () => {
        const visibleCandidates = [
            candidate({ id: 'agent-1', name: 'Reviewer', kind: 'agent' }),
            candidate({ id: 'skill-1', name: 'Writer', kind: 'skill', packageId: 'writer-package' }),
            candidate({ id: 'mcp-1', name: 'Filesystem', kind: 'mcp' }),
        ]
        const selectableIds = selectableImportCandidateIds(
            visibleCandidates,
            new Set(['writer-package']),
            new Set(),
            importInstallTargetKey('workspace', '/tmp/a'),
        )

        expect(selectableIds).toEqual(['agent-1', 'mcp-1'])

        const selectedWithHidden = updateImportCandidateSelection(new Set(['hidden-1']), selectableIds, 'select')
        expect([...selectedWithHidden].sort()).toEqual(['agent-1', 'hidden-1', 'mcp-1'])
        expect(countSelectedImportCandidates(selectedWithHidden, selectableIds)).toBe(2)

        const clearedVisible = updateImportCandidateSelection(selectedWithHidden, selectableIds, 'clear')
        expect([...clearedVisible]).toEqual(['hidden-1'])
    })

    it('offers import-verified curated GitHub repositories in Search', () => {
        expect(CURATED_GITHUB_REPOS.map((source) => source.repo)).toEqual([
            'anthropics/skills',
            'addyosmani/agent-skills',
            'wshobson/agents',
            'vercel-labs/agent-skills',
            'VoltAgent/awesome-claude-code-subagents',
            'VoltAgent/awesome-codex-subagents',
            'disler/claude-code-hooks-mastery',
            'kid-sid/claude-spellbook',
            'PlagueHO/github-copilot-assets-library',
            'SuperClaude-Org/SuperClaude_Plugin',
            'DVC2/cursor_prompts',
            'kinopeee/windsurf-antigravity-rules',
        ])
    })

    it('normalizes GitHub sources into external repository URLs', () => {
        expect(githubSourceUrl('github/awesome-copilot')).toBe('https://github.com/github/awesome-copilot')
        expect(githubSourceUrl('github/awesome-copilot/agents/reviewer.md')).toBe('https://github.com/github/awesome-copilot')
        expect(githubSourceUrl('https://github.com/github/awesome-copilot/tree/main/agents')).toBe('https://github.com/github/awesome-copilot')
        expect(githubSourceUrl('https://raw.githubusercontent.com/github/awesome-copilot/main/README.md')).toBe('https://github.com/github/awesome-copilot')
        expect(githubSourceUrl('git@github.com:github/awesome-copilot.git')).toBe('https://github.com/github/awesome-copilot')
        expect(githubSourceUrl('not a repo')).toBeNull()
    })

    it('converts registry listings into GitHub preview requests', () => {
        const listing: RegistryListing = {
            id: 'reviewer',
            slug: 'reviewer',
            name: 'Reviewer',
            summary: 'Review agent',
            kind: 'agent',
            source: {
                type: 'github',
                repo: 'acme/agents',
                ref: 'main',
                path: 'reviewer.md',
            },
            importRecipe: {
                format: 'claude-md',
                adapter: 'claude-agent-md@1',
            },
            targets: {
                claude: 'native',
            },
            tags: ['review'],
            trust: {
                level: 'indexed',
                verifiedSource: false,
            },
            status: 'active',
            createdAt: '2026-05-31T00:00:00.000Z',
            updatedAt: '2026-05-31T00:00:00.000Z',
        }

        expect(registryListingSource(listing)).toBe('acme/agents/reviewer.md')
        expect(registryListingToGitHubImportRequest(listing)).toEqual({
            source: 'acme/agents/reviewer.md',
            ref: 'main',
            format: 'claude-md',
            limit: 1,
            registryListingId: 'reviewer',
        })
    })

    it('rejects registry import recipes Studio cannot preview', () => {
        const listing = {
            id: 'cursor',
            slug: 'cursor',
            name: 'Cursor Rules',
            summary: 'Cursor rules',
            kind: 'instruction',
            source: { type: 'github', repo: 'acme/rules', ref: 'main' },
            importRecipe: { format: 'cursor-rules', adapter: 'cursor-rules@1' },
            targets: { cursor: 'native' },
            tags: ['cursor'],
            trust: { level: 'indexed', verifiedSource: false },
            status: 'active',
            createdAt: '2026-05-31T00:00:00.000Z',
            updatedAt: '2026-05-31T00:00:00.000Z',
        } as RegistryListing

        expect(registryListingToGitHubImportRequest(listing)).toBeNull()
    })
})
