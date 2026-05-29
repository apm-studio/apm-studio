import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDraft } from '../../services/drafts/service.js'

describe('draft item routes', () => {
    let tmpDir: string

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-draft-item-'))
    })

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('rejects invalid draft content updates', async () => {
        const draft = await createDraft(tmpDir, {
            kind: 'instruction',
            name: 'Instruction',
            content: '# Instruction',
        })
        const { default: draftsItem } = await import('./item.js')

        const res = await draftsItem.request(
            `http://studio.local/api/drafts/instruction/${draft.id}?workingDir=${encodeURIComponent(tmpDir)}`,
            {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ content: { body: '# not text' } }),
            },
        )

        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toEqual({
            error: 'instruction draft content must be a string.',
        })
    })
})
