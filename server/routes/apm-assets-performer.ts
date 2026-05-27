import { Hono } from 'hono'
import type { PerformerAsset } from '../lib/apm-asset-source.js'
import {
    getApmAssetPerformer,
    searchApmAssetRegistry,
    searchSkillsCatalog,
    validateApmAssetPerformer,
} from '../services/apm-asset-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const apmAssetsPerformer = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

apmAssetsPerformer.get('/api/apm/assets/performers/:urn{.+}', async (c) => {
    const cwd = requestWorkingDir(c)
    const urn = c.req.param('urn')
    try {
        const performer = await getApmAssetPerformer(cwd, `performer/${urn}`)
        if (!performer) return jsonError(c, 'Agent not found', 404)
        return c.json(performer)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

apmAssetsPerformer.get('/api/apm/assets/search', async (c) => {
    const query = c.req.query('q') || ''
    const kind = c.req.query('kind')
    const limit = parseInt(c.req.query('limit') || '20', 10)
    try {
        // Call the APM Studio registry and skills.sh in parallel.
        const shouldSearchSkillsSh = !kind || kind === 'dance' || kind === 'all'
        const [apmResults, skillsShResults] = await Promise.all([
            searchApmAssetRegistry(query, { kind, limit }),
            shouldSearchSkillsSh ? searchSkillsCatalog(query, 10).catch(() => []) : Promise.resolve([]),
        ])

        // Deduplicate by name: APM Studio registry results take priority.
        const apmNames = new Set(apmResults.map((r) => r.name))
        const merged = [...apmResults, ...skillsShResults.filter((r) => !apmNames.has(r.name))]

        return c.json(merged)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

apmAssetsPerformer.post('/api/apm/assets/validate', async (c) => {
    const performer = await c.req.json<PerformerAsset>()
    try {
        validateApmAssetPerformer(performer)
        return c.json({ valid: true })
    } catch (error: unknown) {
        return c.json({ valid: false, error: errorMessage(error) })
    }
})

export default apmAssetsPerformer
