import { Hono } from 'hono'
import {
    createDraft,
    listDrafts,
} from '../../services/drafts/service.js'
import type {
    CreateDraftRequest,
    DraftKind,
    DraftListResponse,
    DraftResponse,
} from '../../../shared/draft-contracts.js'
import { jsonError, requestWorkingDir } from '../route-errors.js'
import { StudioValidationError } from '../../lib/opencode-errors.js'

const VALID_KINDS = new Set<DraftKind>(['instruction', 'skill', 'agent', 'team'])

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

function isValidKind(kind: string): kind is DraftKind {
    return VALID_KINDS.has(kind as DraftKind)
}

const draftsCollection = new Hono()

draftsCollection.get('/api/drafts', async (c) => {
    const cwd = requestWorkingDir(c)
    const kind = c.req.query('kind')

    try {
        const result = await listDrafts(
            cwd,
            kind && isValidKind(kind) ? kind : undefined,
        )
        const response: DraftListResponse = { drafts: result }
        return c.json(response)
    } catch {
        const response: DraftListResponse = { drafts: [] }
        return c.json(response)
    }
})

draftsCollection.post('/api/drafts', async (c) => {
    const cwd = requestWorkingDir(c)
    const body = await c.req.json<CreateDraftRequest>().catch(() => null)

    if (!body?.kind || !body?.name) {
        return jsonError(c, 'kind and name are required.', 400)
    }
    if (!isValidKind(body.kind)) {
        return jsonError(c, `Invalid kind '${body.kind}'.`, 400)
    }

    try {
        const draft = await createDraft(cwd, body)
        const response: DraftResponse = { draft }
        return c.json(response, 201)
    } catch (error: unknown) {
        if (error instanceof StudioValidationError) {
            return jsonError(c, error.message, error.status as 400)
        }
        return jsonError(c, errorMessage(error), 500)
    }
})

export default draftsCollection
