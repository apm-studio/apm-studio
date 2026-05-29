import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DraftResponse } from '../../../shared/draft-contracts.js'

describe('draft collection routes', () => {
    let tmpDir: string

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-drafts-'))
    })

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('normalizes agent draft content at the route boundary', async () => {
        const { default: draftsCollection } = await import('./collection.js')

        const res = await draftsCollection.request(
            `http://studio.local/api/drafts?workingDir=${encodeURIComponent(tmpDir)}`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    kind: 'agent',
                    name: 'Research Agent',
                    content: {
                        instructionRef: { kind: 'registry', urn: 'instruction/@user/research/base' },
                        skillRefs: [{ kind: 'draft', draftId: 'skill-draft-1' }],
                        model: { provider: 'openai', modelId: 'gpt-5', temperature: 0.3 },
                        mcpServerNames: ['github'],
                        mcpBindingMap: { code: 'github' },
                        planMode: true,
                        unknown: 'drop-me',
                    },
                }),
            },
        )

        expect(res.status).toBe(201)
        const body = await res.json() as DraftResponse
        expect(body.draft.content).toEqual({
            instructionRef: { kind: 'registry', urn: 'instruction/@user/research/base' },
            skillRefs: [{ kind: 'draft', draftId: 'skill-draft-1' }],
            model: { provider: 'openai', modelId: 'gpt-5', temperature: 0.3 },
            mcpServerNames: ['github'],
            mcpBindingMap: { code: 'github' },
            planMode: true,
        })
    })

    it('rejects content that does not match the selected draft kind', async () => {
        const { default: draftsCollection } = await import('./collection.js')

        const res = await draftsCollection.request(
            `http://studio.local/api/drafts?workingDir=${encodeURIComponent(tmpDir)}`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    kind: 'skill',
                    name: 'Broken Skill',
                    content: { body: '# not a string' },
                }),
            },
        )

        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toEqual({
            error: 'skill draft content must be a string.',
        })
    })
})
