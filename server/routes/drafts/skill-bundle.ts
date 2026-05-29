/**
 * Routes for Skill draft file operations.
 *
 * These endpoints operate on files within a bundle-backed Skill draft directory.
 * Generic draft CRUD (create/read/update/delete/list) is in collection.ts / item.ts.
 */

import { Hono } from 'hono'
import {
    skillBundleDir,
    getSkillBundleTree,
    readSkillBundleFile,
    writeSkillBundleFile,
    createSkillBundleFile,
    deleteSkillBundleFile,
    isSkillBundleDraft,
} from '../../services/drafts/skill-bundle-service.js'
import { openStudioPath } from '../../services/studio/service.js'
import { jsonError, jsonServiceFailure, requestWorkingDir } from '../route-errors.js'
import type {
    BundleFileCreateRequest,
    BundleFileDeleteRequest,
    BundleFileOperationResponse,
    BundleFileReadResponse,
    BundleFileWriteRequest,
    BundleFolderOpenResponse,
    BundleTreeResponse,
} from '../../../shared/draft-contracts.js'

const draftsSkillBundle = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

// ── Tree ────────────────────────────────────────────────

draftsSkillBundle.get('/api/drafts/skill/:id/tree', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')

    if (!await isSkillBundleDraft(cwd, id)) {
        return jsonError(c, 'Skill draft not found.', 404)
    }

    try {
        const tree = await getSkillBundleTree(cwd, id)
        const response: BundleTreeResponse = { tree }
        return c.json(response)
    } catch (error: unknown) {
        return jsonError(c, errorMessage(error), 500)
    }
})

// ── Open folder ─────────────────────────────────────────

draftsSkillBundle.post('/api/drafts/skill/:id/open-folder', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')

    if (!await isSkillBundleDraft(cwd, id)) {
        return jsonError(c, 'Skill draft not found.', 404)
    }

    const result = await openStudioPath(skillBundleDir(cwd, id))
    if (!result.ok) {
        return jsonServiceFailure(c, result)
    }
    const response: BundleFolderOpenResponse = {
        ok: true,
        path: result.path,
    }
    return c.json(response)
})

// ── Read file ───────────────────────────────────────────

draftsSkillBundle.get('/api/drafts/skill/:id/file', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')
    const filePath = c.req.query('path')

    if (!filePath) {
        return jsonError(c, 'path query parameter is required.', 400)
    }
    if (!await isSkillBundleDraft(cwd, id)) {
        return jsonError(c, 'Skill draft not found.', 404)
    }

    try {
        const content = await readSkillBundleFile(cwd, id, filePath)
        const response: BundleFileReadResponse = { path: filePath, content }
        return c.json(response)
    } catch (error: unknown) {
        const msg = errorMessage(error)
        const status = msg.includes('not allowed') || msg.includes('not permitted') ? 400 : msg.includes('not found') ? 404 : 500
        return jsonError(c, msg, status as 400 | 404 | 500)
    }
})

// ── Write file ──────────────────────────────────────────

draftsSkillBundle.put('/api/drafts/skill/:id/file', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')
    const body = await c.req.json<BundleFileWriteRequest>().catch(() => null)

    if (!body?.path || typeof body.content !== 'string') {
        return jsonError(c, 'path and content are required.', 400)
    }
    if (!await isSkillBundleDraft(cwd, id)) {
        return jsonError(c, 'Skill draft not found.', 404)
    }

    try {
        await writeSkillBundleFile(cwd, id, body.path, body.content)
        const response: BundleFileOperationResponse = { ok: true, path: body.path }
        return c.json(response)
    } catch (error: unknown) {
        const msg = errorMessage(error)
        const status = msg.includes('not allowed') || msg.includes('not permitted') ? 400 : 500
        return jsonError(c, msg, status as 400 | 500)
    }
})

// ── Create file/directory ───────────────────────────────

draftsSkillBundle.post('/api/drafts/skill/:id/files', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')
    const body = await c.req.json<BundleFileCreateRequest>().catch(() => null)

    if (!body?.path) {
        return jsonError(c, 'path is required.', 400)
    }
    if (!await isSkillBundleDraft(cwd, id)) {
        return jsonError(c, 'Skill draft not found.', 404)
    }

    try {
        await createSkillBundleFile(cwd, id, body.path, body.isDirectory)
        const response: BundleFileOperationResponse = { ok: true, path: body.path }
        return c.json(response, 201)
    } catch (error: unknown) {
        const msg = errorMessage(error)
        const status = msg.includes('already exists') ? 400 : msg.includes('not allowed') ? 400 : 500
        return jsonError(c, msg, status as 400 | 500)
    }
})

// ── Delete file ─────────────────────────────────────────

draftsSkillBundle.delete('/api/drafts/skill/:id/file', async (c) => {
    const cwd = requestWorkingDir(c)
    const id = c.req.param('id')
    const body = await c.req.json<BundleFileDeleteRequest>().catch(() => null)

    if (!body?.path) {
        return jsonError(c, 'path is required.', 400)
    }
    if (!await isSkillBundleDraft(cwd, id)) {
        return jsonError(c, 'Skill draft not found.', 404)
    }

    try {
        await deleteSkillBundleFile(cwd, id, body.path)
        const response: BundleFileOperationResponse = { ok: true, path: body.path }
        return c.json(response)
    } catch (error: unknown) {
        const msg = errorMessage(error)
        const status = msg.includes('Cannot delete') ? 400 : msg.includes('not allowed') ? 400 : 500
        return jsonError(c, msg, status as 400 | 500)
    }
})

export default draftsSkillBundle
