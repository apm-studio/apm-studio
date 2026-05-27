import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { importExploreListing, searchExploreCatalog } from './explore-registry-service.js'
import { listApmAgentProjectionSnapshots, readApmPackage } from './apm-package-service.js'

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

describe('explore registry service', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-explore-'))
        vi.stubEnv('APM_STUDIO_REGISTRY_URL', 'https://registry.test')
    })

    afterEach(async () => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    it('queries the source-reference catalog API', async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ listings: [listing] }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await searchExploreCatalog({ q: 'review', kind: 'agent', target: 'codex', limit: 5 })

        expect(result.listings).toHaveLength(1)
        expect(fetchMock).toHaveBeenCalledWith(new URL('https://registry.test/v1/catalog?q=review&kind=agent&target=codex&limit=5'))
    })

    it('imports Codex TOML listings as APM-first agent packages', async () => {
        const fetchMock = vi.fn(async (url: URL) => {
            const href = url.toString()
            if (href === 'https://registry.test/v1/listings/voltagent-codex-reviewer') {
                return jsonResponse({ listing })
            }
            if (href === 'https://raw.githubusercontent.com/VoltAgent/awesome-codex-subagents/main/categories/reviewer.toml') {
                return new Response([
                    'name = "code-reviewer"',
                    'description = "Find correctness and regression risks."',
                    'model = "gpt-5.4"',
                    'model_reasoning_effort = "high"',
                    'developer_instructions = """',
                    'Review for bugs first.',
                    'Keep summaries short.',
                    '"""',
                ].join('\n'))
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await importExploreListing(workingDir, 'voltagent-codex-reviewer')

        const pkg = await readApmPackage(workingDir, result.packageId)
        expect(result.ok).toBe(true)
        expect(pkg?.manifest['x-apm']?.agent?.derivedFrom).toBe('registry:voltagent-codex-reviewer')
        expect(pkg?.manifest['x-apm']?.agent?.agentBody).toContain('Review for bugs first.')
        expect(pkg?.manifest.agents?.[0]).toMatchObject({
            name: 'code-reviewer',
            model: { provider: 'openai', modelId: 'gpt-5.4' },
        })

        const snapshots = await listApmAgentProjectionSnapshots(workingDir)
        expect(snapshots).toEqual([
            expect.objectContaining({
                id: result.packageId,
                name: 'code-reviewer',
                inlineInstruction: expect.stringContaining('Keep summaries short.'),
                model: { provider: 'openai', modelId: 'gpt-5.4' },
            }),
        ])
    })
})
