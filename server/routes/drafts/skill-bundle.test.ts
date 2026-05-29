import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiErrorResponse } from '../../../shared/api-contracts.js'
import type { BundleFolderOpenResponse } from '../../../shared/draft-contracts.js'

const openStudioPathMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/studio/service.js', () => ({
    openStudioPath: openStudioPathMock,
}))

describe('draft skill bundle routes', () => {
    let tmpDir: string

    beforeEach(async () => {
        openStudioPathMock.mockReset()
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-drafts-'))
    })

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('opens saved skill bundle folders through the draft route boundary', async () => {
        const { default: draftsSkillBundle } = await import('./skill-bundle.js')
        const bundleDir = path.join(tmpDir, '.apm-studio', 'drafts', 'skill', 'skill-draft-1')
        await fs.mkdir(bundleDir, { recursive: true })
        await fs.writeFile(path.join(bundleDir, 'draft.json'), '{}', 'utf-8')
        openStudioPathMock.mockResolvedValue({ ok: true, path: bundleDir })

        const res = await draftsSkillBundle.request(
            `http://studio.local/api/drafts/skill/skill-draft-1/open-folder?workingDir=${encodeURIComponent(tmpDir)}`,
            { method: 'POST' },
        )
        const body = await res.json() as BundleFolderOpenResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({ ok: true, path: bundleDir })
        expect(openStudioPathMock).toHaveBeenCalledWith(bundleDir)
    })

    it('returns 404 instead of exposing draft storage paths for missing bundles', async () => {
        const { default: draftsSkillBundle } = await import('./skill-bundle.js')

        const res = await draftsSkillBundle.request(
            `http://studio.local/api/drafts/skill/missing/open-folder?workingDir=${encodeURIComponent(tmpDir)}`,
            { method: 'POST' },
        )
        const body = await res.json() as ApiErrorResponse

        expect(res.status).toBe(404)
        expect(body).toEqual({ error: 'Skill draft not found.' })
        expect(openStudioPathMock).not.toHaveBeenCalled()
    })
})
