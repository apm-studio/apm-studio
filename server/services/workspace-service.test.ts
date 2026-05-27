import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

const pruneStalePerformerProjectionsMock = vi.fn()
const ensureAssistantAgentMock = vi.fn()

vi.mock('./opencode-projection/stage-projection-service.js', () => ({
    pruneStalePerformerProjections: pruneStalePerformerProjectionsMock,
}))

vi.mock('./studio-assistant/assistant-service.js', () => ({
    ensureAssistantAgent: ensureAssistantAgentMock,
}))

describe('saveWorkspaceSnapshot', () => {
    let studioDir: string

    beforeEach(async () => {
        studioDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-workspace-service-'))
        process.env.STUDIO_DIR = studioDir
        pruneStalePerformerProjectionsMock.mockReset().mockResolvedValue(false)
        ensureAssistantAgentMock.mockReset().mockResolvedValue('studio-assistant')
        vi.resetModules()
    })

    afterEach(async () => {
        delete process.env.STUDIO_DIR
        await fs.rm(studioDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('prunes stale performer projections using the saved performer ids', async () => {
        const { saveWorkspaceSnapshot } = await import('./workspace-service.js')
        const workingDir = path.join(studioDir, 'project')

        const result = await saveWorkspaceSnapshot({
            workingDir,
            performers: [{ id: 'performer-1' }, { id: 'performer-2' }],
            acts: [],
        })

        expect(result.ok).toBe(true)
        expect(pruneStalePerformerProjectionsMock).toHaveBeenCalledWith(workingDir, ['performer-1', 'performer-2'])
    })

    it('lists workspace performers from the saved workspace snapshot', async () => {
        const { saveWorkspaceSnapshot, listWorkspacePerformersForDir } = await import('./workspace-service.js')
        const workingDir = path.join(studioDir, 'project')

        await saveWorkspaceSnapshot({
            workingDir,
            performers: [
                { id: 'performer-1', name: 'Performer 1', model: { provider: 'openai', modelId: 'gpt-5' } },
                { id: 'performer-2', name: 'Performer 2', model: null },
            ],
            acts: [],
        })

        await expect(listWorkspacePerformersForDir(workingDir)).resolves.toEqual([
            expect.objectContaining({ id: 'performer-1', name: 'Performer 1', model: { provider: 'openai', modelId: 'gpt-5' } }),
            expect.objectContaining({ id: 'performer-2', name: 'Performer 2', model: null }),
        ])
    })

    it('returns saved workspaces with APM manifests as the package source of truth', async () => {
        const { getSavedWorkspace, saveWorkspaceSnapshot } = await import('./workspace-service.js')
        const { readApmPackage, writeApmPackage } = await import('./apm-package-service.js')
        const workingDir = path.join(studioDir, 'project')

        const saved = await saveWorkspaceSnapshot({
            workingDir,
            performers: [{
                id: 'performer-1',
                name: 'Workspace Copy',
                model: null,
                inlineInstruction: 'Stale workspace instruction.',
            }],
            acts: [],
        })

        expect(saved.ok).toBe(true)
        if (!saved.ok) {
            return
        }

        const pkg = await readApmPackage(workingDir, 'performer-1')
        expect(pkg).not.toBeNull()
        if (!pkg) return

        const agent = pkg.manifest['x-apm']?.agent
        expect(agent).toBeTruthy()
        if (!agent) return

        await writeApmPackage(workingDir, 'performer-1', {
            ...pkg.manifest,
            'x-apm': {
                ...pkg.manifest['x-apm'],
                schemaVersion: 1,
                packageId: 'performer-1',
                kind: 'agent',
                agent: {
                    ...agent,
                    performerName: 'Manifest Agent',
                    inlineInstruction: 'Manifest instruction wins.',
                },
            },
        })

        const loaded = await getSavedWorkspace(saved.id)
        expect(loaded.ok).toBe(true)
        if (!loaded.ok) {
            return
        }

        expect(loaded.workspace.performers?.[0]).toEqual(expect.objectContaining({
            id: 'performer-1',
            name: 'Manifest Agent',
            inlineInstruction: 'Manifest instruction wins.',
        }))
    })

    it('fails workspace save when APM package state cannot be written', async () => {
        const { saveWorkspaceSnapshot } = await import('./workspace-service.js')
        const workingDir = path.join(studioDir, 'project-file')
        await fs.writeFile(workingDir, '')

        const result = await saveWorkspaceSnapshot({
            workingDir,
            performers: [{ id: 'performer-1', name: 'Performer 1', model: null }],
            acts: [],
        })

        expect(result).toEqual({
            ok: false,
            status: 500,
            error: 'Failed to write APM package state',
        })
    })

    it('preserves hiddenFromList when saving an already-hidden workspace without that field', async () => {
        const { getSavedWorkspace, saveWorkspaceSnapshot, setSavedWorkspaceHidden } = await import('./workspace-service.js')
        const workingDir = path.join(studioDir, 'project')

        const initialSave = await saveWorkspaceSnapshot({
            workingDir,
            performers: [{ id: 'performer-1' }],
            acts: [],
        })

        expect(initialSave.ok).toBe(true)
        if (!initialSave.ok) {
            return
        }

        await setSavedWorkspaceHidden(initialSave.id, true)
        await saveWorkspaceSnapshot({
            workingDir,
            performers: [{ id: 'performer-1' }, { id: 'performer-2' }],
            acts: [],
        })

        const savedWorkspace = await getSavedWorkspace(initialSave.id)
        expect(savedWorkspace.ok).toBe(true)
        if (!savedWorkspace.ok) {
            return
        }

        expect(savedWorkspace.workspace.hiddenFromList).toBe(true)
    })
})
