import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordImportCatalogDownload, searchImportCatalog } from './registry-service.js'

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

    it('uses the public APM Studio registry when no override is configured', async () => {
        vi.unstubAllEnvs()
        const fetchMock = vi.fn(async () => jsonResponse({ listings: [listing] }))
        vi.stubGlobal('fetch', fetchMock)

        await searchImportCatalog({ q: 'review' })

        expect(fetchMock).toHaveBeenCalledWith(new URL('https://registry.apm.studio/v1/catalog?q=review&limit=20'))
    })

    it('falls back to the transition workers.dev registry when the public endpoint is unavailable', async () => {
        vi.unstubAllEnvs()
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('DNS unavailable'))
            .mockResolvedValueOnce(jsonResponse({ listings: [listing] }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await searchImportCatalog({ q: 'review' })

        expect(result.listings).toHaveLength(1)
        expect(fetchMock).toHaveBeenNthCalledWith(1, new URL('https://registry.apm.studio/v1/catalog?q=review&limit=20'))
        expect(fetchMock).toHaveBeenNthCalledWith(2, new URL('https://apm-registry.dance-of-tal.workers.dev/v1/catalog?q=review&limit=20'))
    })

    it('records successful registry imports as anonymous download events', async () => {
        vi.stubEnv('APM_STUDIO_REGISTRY_EVENT_TOKEN', 'event-token')
        const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
        vi.stubGlobal('fetch', fetchMock)

        await recordImportCatalogDownload({
            source: 'acme/agents/reviewer.md',
            format: 'claude-md',
            registryListingId: 'reviewer',
        }, {
            ok: true,
            scope: 'workspace',
            targetWorkingDir: '/tmp/workspace',
            source: {
                repo: 'acme/agents',
                ref: 'main',
                subpath: 'reviewer.md',
            },
            packages: [],
            warnings: [],
        })

        expect(fetchMock).toHaveBeenCalledWith(new URL('https://registry.test/v1/downloads'), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: 'Bearer event-token',
            },
            body: JSON.stringify({
                listingId: 'reviewer',
                source: {
                    type: 'github',
                    repo: 'acme/agents',
                    ref: 'main',
                    path: 'reviewer.md',
                },
                importRecipe: {
                    format: 'claude-md',
                    adapter: 'claude-md@studio-import',
                },
            }),
        })
    })

    it('skips download recording for manual GitHub imports', async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
        vi.stubGlobal('fetch', fetchMock)

        await recordImportCatalogDownload({
            source: 'acme/agents',
            format: 'auto',
        }, {
            ok: true,
            scope: 'workspace',
            targetWorkingDir: '/tmp/workspace',
            source: {
                repo: 'acme/agents',
                ref: 'main',
            },
            packages: [],
            warnings: [],
        })

        expect(fetchMock).not.toHaveBeenCalled()
    })
})
