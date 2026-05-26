import { Hono } from 'hono'
import type { RegistryListingKind, RegistryTargetId } from '../../shared/registry-contracts.js'
import {
    importExploreListing,
    listExplorePresets,
    readExploreListing,
    readExplorePreset,
    searchExploreCatalog,
} from '../services/explore-registry-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const explore = new Hono()

function errorMessage(error: unknown, fallback = 'Explore request failed.') {
    return error instanceof Error && error.message ? error.message : fallback
}

explore.get('/api/explore/catalog', async (c) => {
    try {
        return c.json(await searchExploreCatalog({
            q: c.req.query('q') || undefined,
            kind: c.req.query('kind') as RegistryListingKind | undefined,
            target: c.req.query('target') as RegistryTargetId | undefined,
            tag: c.req.query('tag') || undefined,
            cursor: c.req.query('cursor') || undefined,
            limit: Number(c.req.query('limit') || 20),
        }))
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to search Explore catalog.'), 500)
    }
})

explore.get('/api/explore/listings/:idOrSlug', async (c) => {
    try {
        return c.json(await readExploreListing(c.req.param('idOrSlug')))
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to read Explore listing.'), 500)
    }
})

explore.post('/api/explore/listings/:idOrSlug/import', async (c) => {
    try {
        return c.json(await importExploreListing(requestWorkingDir(c), c.req.param('idOrSlug')), 201)
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to import Explore listing.'), 500)
    }
})

explore.get('/api/explore/presets', async (c) => {
    try {
        return c.json(await listExplorePresets())
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to list Explore presets.'), 500)
    }
})

explore.get('/api/explore/presets/:idOrSlug', async (c) => {
    try {
        return c.json(await readExplorePreset(c.req.param('idOrSlug')))
    } catch (error) {
        return jsonError(c, errorMessage(error, 'Unable to read Explore preset.'), 500)
    }
})

export default explore
