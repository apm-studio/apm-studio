import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchImportCatalog } from './registry-service.js'

const listing = {
    id: 'voltagent-codex-reviewer',
    slug: 'codex-reviewer',
    name: 'Codex Reviewer',
    summary: 'Review-focused Codex subagent.',
    kind: 'agent',
    source: {
        type: 'github',
        repo: 'VoltAgent/awesome-codex-subagents',
        ref: 'main',
        path: 'categories/reviewer.toml',
    },
    importRecipe: {
        format: 'codex-toml',
        adapter: 'codex-subagent-toml@1',
    },
    targets: {
        codex: 'native',
    },
    tags: ['codex', 'review'],
    license: 'MIT',
    trust: {
        level: 'curated',
        verifiedSource: false,
    },
    status: 'active',
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
}

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })
}

describe('import registry service', () => {
    beforeEach(() => {
        vi.stubEnv('APM_STUDIO_REGISTRY_URL', 'https://registry.test')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    it('queries the source-reference catalog API', async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ listings: [listing] }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await searchImportCatalog({ q: 'review', kind: 'agent', target: 'codex', limit: 5 })

        expect(result.listings).toHaveLength(1)
        expect(fetchMock).toHaveBeenCalledWith(new URL('https://registry.test/v1/catalog?q=review&kind=agent&target=codex&limit=5'))
    })
})
