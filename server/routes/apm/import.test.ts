import { afterEach, describe, expect, it, vi } from 'vitest'
import apmImportRoutes from './import.js'

vi.mock('../../services/apm-package/github-import.js', () => ({
    importApmPackagesFromGitHub: vi.fn(async () => ({
        ok: true,
        scope: 'workspace',
        targetWorkingDir: '/tmp/workspace',
        source: {
            repo: 'acme/agents',
            ref: 'main',
            subpath: 'reviewer.md',
        },
        packages: [{
            packageId: 'reviewer',
            name: 'Reviewer',
            kind: 'agent',
            sourcePath: 'reviewer.md',
            packagePath: 'packages/reviewer',
            manifestPath: 'packages/reviewer/apm.yml',
        }],
        warnings: [],
    })),
    listApmGitHubSourceItems: vi.fn(async () => ({ ok: true, sources: [], primitives: [], warnings: [] })),
    previewApmPackagesFromGitHub: vi.fn(async () => ({ ok: true, source: { repo: 'acme/agents', ref: 'main' }, candidates: [], warnings: [] })),
}))

const searchImportCatalogMock = vi.fn(async (...args: unknown[]): Promise<{ listings: unknown[] }> => {
    void args
    return { listings: [] }
})
const recordImportCatalogDownloadMock = vi.fn(async (...args: unknown[]) => {
    void args
})

vi.mock('../../services/import/registry-service.js', () => ({
    searchImportCatalog: (query: unknown) => searchImportCatalogMock(query),
    recordImportCatalogDownload: (request: unknown, response: unknown) => recordImportCatalogDownloadMock(request, response),
}))

vi.mock('../route-errors.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../route-errors.js')>()
    return {
        ...actual,
        requestWorkingDir: () => '/tmp/workspace',
    }
})

describe('apm import routes', () => {
    afterEach(() => {
        searchImportCatalogMock.mockClear()
        recordImportCatalogDownloadMock.mockClear()
    })

    it('proxies registry catalog search', async () => {
        searchImportCatalogMock.mockResolvedValueOnce({ listings: [{ id: 'reviewer' }] })

        const res = await apmImportRoutes.request('http://studio.local/api/apm/import/catalog?q=review&kind=agent&target=codex&limit=4')

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ listings: [{ id: 'reviewer' }] })
        expect(searchImportCatalogMock).toHaveBeenCalledWith({
            q: 'review',
            kind: 'agent',
            target: 'codex',
            tag: undefined,
            limit: 4,
            cursor: undefined,
        })
    })

    it('records registry download events after successful imports', async () => {
        const body = {
            source: 'acme/agents/reviewer.md',
            format: 'claude-md',
            registryListingId: 'reviewer',
        }

        const res = await apmImportRoutes.request('http://studio.local/api/apm/import/github?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })

        expect(res.status).toBe(201)
        expect(recordImportCatalogDownloadMock).toHaveBeenCalledWith(body, expect.objectContaining({ ok: true }))
    })

    it('does not fail imports when registry download recording fails', async () => {
        recordImportCatalogDownloadMock.mockRejectedValueOnce(new Error('registry down'))

        const res = await apmImportRoutes.request('http://studio.local/api/apm/import/github?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: 'acme/agents/reviewer.md',
                format: 'claude-md',
                registryListingId: 'reviewer',
            }),
        })

        expect(res.status).toBe(201)
    })
})
