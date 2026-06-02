import { describe, expect, it } from 'vitest'
import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportPreviewResponse,
} from '../../../shared/apm-contracts'
import type { RegistryListing } from '../../../shared/registry-contracts'
import {
    buildImportCandidateDetailModel,
    buildRegistryListingDetailModel,
} from './import-detail-model'

function candidate(partial: Partial<ApmGitHubImportCandidate> = {}): ApmGitHubImportCandidate {
    return {
        id: 'candidate-1',
        name: 'Reviewer',
        description: 'Reviews code.',
        kind: 'agent',
        format: 'claude-md',
        sourcePath: 'agents/reviewer.md',
        packageId: 'reviewer',
        targets: ['codex', 'claude'],
        primitiveCounts: { agents: 1, skills: 2 },
        ...partial,
    }
}

function previewSource(partial: Partial<ApmGitHubImportPreviewResponse['source']> = {}): ApmGitHubImportPreviewResponse['source'] {
    return {
        repo: 'acme/agents',
        ref: 'main',
        href: 'https://github.com/acme/agents',
        stars: 1200,
        ...partial,
    }
}

function listing(partial: Partial<RegistryListing> = {}): RegistryListing {
    return {
        id: 'listing-1',
        slug: 'reviewer',
        name: 'Reviewer',
        summary: 'Code review agent',
        description: 'A registry indexed reviewer.',
        kind: 'agent',
        source: {
            type: 'github',
            repo: 'acme/agents',
            ref: 'main',
            path: 'agents/reviewer.md',
            resolvedCommitSha: 'abc123',
        },
        importRecipe: {
            format: 'claude-md',
            adapter: 'claude-agent-md@1',
            include: ['agents/reviewer.md'],
        },
        targets: {
            codex: 'transformable',
            claude: 'native',
        },
        tags: ['review', 'quality'],
        license: 'MIT',
        trust: {
            level: 'indexed',
            verifiedSource: true,
            lastIndexedAt: '2026-05-31T00:00:00.000Z',
            contentHash: 'hash-1',
            warnings: ['Review before install.'],
        },
        status: 'active',
        downloads: 42,
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z',
        ...partial,
    }
}

describe('import detail model', () => {
    it('builds candidate metadata with primitive counts, install state, and source fields', () => {
        const model = buildImportCandidateDetailModel({
            candidate: candidate(),
            previewSource: previewSource(),
            installScope: 'workspace',
            installed: false,
            selected: true,
        })

        expect(model.title).toBe('Reviewer')
        expect(model.badges).toEqual(expect.arrayContaining([
            'agent',
            'claude-md',
            'Selected',
            'Workspace install',
            'codex',
            'claude',
        ]))
        expect(model.sections.find((section) => section.title === 'Import Item')?.rows)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ label: 'Package ID', value: 'reviewer' }),
                expect.objectContaining({ label: 'Install status', value: 'Not installed' }),
            ]))
        expect(model.sections.find((section) => section.title === 'Candidate Content')?.tab).toBe('content')
        expect(model.sections.find((section) => section.title === 'Import Item')?.tab).toBe('metadata')
        expect(model.sections.find((section) => section.title === 'Source')?.rows)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ label: 'Repository', value: 'acme/agents' }),
                expect.objectContaining({ label: 'Stars', value: '1200' }),
            ]))
        expect(model.sections.find((section) => section.title === 'Primitives')?.badges)
            .toEqual(expect.arrayContaining(['Agents: 1', 'Skills: 2']))
        expect(model.sections.find((section) => section.title === 'Primitives')?.tab).toBe('other')
    })

    it('builds registry listing metadata with trust and target support', () => {
        const model = buildRegistryListingDetailModel(listing())

        expect(model.title).toBe('Reviewer')
        expect(model.badges).toEqual(expect.arrayContaining([
            'agent',
            'claude-md',
            'indexed',
            'active',
            'review',
        ]))
        expect(model.sections.find((section) => section.title === 'Source')?.rows)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ label: 'Repository', value: 'acme/agents' }),
                expect.objectContaining({ label: 'Adapter', value: 'claude-agent-md@1' }),
            ]))
        expect(model.sections.find((section) => section.title === 'Listing Content')?.tab).toBe('content')
        expect(model.sections.find((section) => section.title === 'Source')?.tab).toBe('metadata')
        expect(model.sections.find((section) => section.title === 'Trust And Targets')?.badges)
            .toEqual(expect.arrayContaining(['codex: transformable', 'claude: native']))
        expect(model.sections.find((section) => section.title === 'Trust And Targets')?.notices)
            .toEqual(expect.arrayContaining([expect.objectContaining({ text: 'Review before install.' })]))
        expect(model.sections.find((section) => section.title === 'Trust And Targets')?.tab).toBe('other')
    })
})
