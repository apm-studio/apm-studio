import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensurePublishableDependencies, saveLocalStudioAsset } from './apm-asset-authoring.js'

describe('publish dependency validation', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-publish-check-'))
        vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    })

    afterEach(async () => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    it('blocks performer publish when a referenced Dance is only local', async () => {
        const localDance = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'dance',
            author: 'alice',
            slug: 'review-skill',
            payload: {
                description: 'Review skill',
                content: '---\nname: "review-skill"\ndescription: "Review"\n---\n\nbody',
            },
        })

        const performer = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'performer',
            author: 'alice',
            slug: 'reviewer',
            payload: {
                dances: [localDance.urn],
            },
        })

        await expect(ensurePublishableDependencies(workingDir, 'performer', performer.payload)).rejects.toThrow('Export it from the Dance editor, upload it to GitHub, import it from Packages, and then try again')
    })

    it('blocks act publish when a local participant performer depends on a local Dance', async () => {
        const localDance = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'dance',
            author: 'alice',
            slug: 'review-skill',
            payload: {
                description: 'Review skill',
                content: '---\nname: "review-skill"\ndescription: "Review"\n---\n\nbody',
            },
        })

        const performer = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'performer',
            author: 'alice',
            slug: 'reviewer',
            payload: {
                dances: [localDance.urn],
            },
        })

        const act = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'act',
            author: 'alice',
            slug: 'review-flow',
            payload: {
                participants: [{ key: 'Reviewer', performer: performer.urn }],
                relations: [],
            },
        })

        await expect(ensurePublishableDependencies(workingDir, 'act', act.payload)).rejects.toThrow('Export it from the Dance editor, upload it to GitHub, import it from Packages, and then try again')
    })

    it('saves local assets with an explicit stage override', async () => {
        const result = await saveLocalStudioAsset({
            cwd: workingDir,
            kind: 'tal',
            author: 'alice',
            slug: 'reviewer-tal',
            stage: 'Launch Stage',
            payload: {
                description: 'Reviewer Tal',
                content: '# Review carefully',
            },
        })

        expect(result.urn).toBe('tal/@alice/launch-stage/reviewer-tal')
    })

})
