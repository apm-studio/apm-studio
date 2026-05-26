import { Hono } from 'hono'
import type { PerformerAsset } from '../lib/roster-source.js'
import {
    getRosterPerformer,
    searchRosterRegistry,
    searchSkillsCatalog,
    validateRosterPerformer,
} from '../services/roster-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const rosterPerformer = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

rosterPerformer.get('/api/roster/performers/:urn{.+}', async (c) => {
    const cwd = requestWorkingDir(c)
    const urn = c.req.param('urn')
    try {
        const performer = await getRosterPerformer(cwd, `performer/${urn}`)
        if (!performer) return jsonError(c, 'Agent not found', 404)
        return c.json(performer)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

rosterPerformer.get('/api/roster/search', async (c) => {
    const query = c.req.query('q') || ''
    const kind = c.req.query('kind')
    const limit = parseInt(c.req.query('limit') || '20', 10)
    try {
        // Call the 8PM Studio registry and skills.sh in parallel.
        const shouldSearchSkillsSh = !kind || kind === 'dance' || kind === 'all'
        const [rosterResults, skillsShResults] = await Promise.all([
            searchRosterRegistry(query, { kind, limit }),
            shouldSearchSkillsSh ? searchSkillsCatalog(query, 10).catch(() => []) : Promise.resolve([]),
        ])

        // Deduplicate by name: 8PM Studio registry results take priority.
        const rosterNames = new Set(rosterResults.map((r) => r.name))
        const merged = [...rosterResults, ...skillsShResults.filter((r) => !rosterNames.has(r.name))]

        return c.json(merged)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

rosterPerformer.post('/api/roster/validate', async (c) => {
    const performer = await c.req.json<PerformerAsset>()
    try {
        validateRosterPerformer(performer)
        return c.json({ valid: true })
    } catch (error: unknown) {
        return c.json({ valid: false, error: errorMessage(error) })
    }
})

export default rosterPerformer
