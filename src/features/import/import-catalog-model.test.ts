import { describe, expect, it } from 'vitest'
import type { ApmGitHubImportCandidate } from '../../../shared/apm-contracts'
import {
    candidateInstallKey,
    CURATED_GITHUB_REPOS,
    filterImportCandidates,
    githubSourceUrl,
    registryListingSource,
    registryListingToGitHubImportRequest,
    scopeLabel,
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

    it('keeps install labels and keys stable by scope', () => {
        expect(scopeLabel('workspace')).toBe('Workspace')
        expect(scopeLabel('user')).toBe('User')
        expect(candidateInstallKey('user', 'candidate-1')).toBe('user:candidate-1')
    })

    it('offers high-star curated GitHub repositories in Search', () => {
        expect(CURATED_GITHUB_REPOS.map((source) => source.repo)).toEqual([
            'addyosmani/agent-skills',
            'wshobson/agents',
            'github/awesome-copilot',
            'vercel-labs/agent-skills',
            'VoltAgent/awesome-agent-skills',
            'VoltAgent/awesome-claude-code-subagents',
            'alirezarezvani/claude-skills',
            'ComposioHQ/agent-orchestrator',
            'KhazP/vibe-coding-prompt-template',
            'microsoft/skills',
            'lst97/claude-code-sub-agents',
            'hesreallyhim/awesome-claude-code-agents',
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
