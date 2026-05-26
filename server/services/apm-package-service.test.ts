import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
    buildApmLockForManifest,
    importApmPackage,
    listApmAgentProjectionSnapshots,
    listApmPackages,
    readApmPackage,
    validateApmPackageManifest,
    writeApmPackagesForWorkspace,
} from './apm-package-service.js'
import type { WorkspacePerformerSnapshot } from './workspace-service.js'

describe('apm package service', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), '8pm-apm-'))
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    function performer(overrides: Partial<WorkspacePerformerSnapshot> = {}): WorkspacePerformerSnapshot {
        return {
            id: 'agent-1',
            name: 'Review Agent',
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            talRef: { kind: 'draft', draftId: 'instruction-1' },
            danceRefs: [{ kind: 'registry', urn: 'dance/@acme/prod/review' }],
            mcpServerNames: ['github'],
            agentId: null,
            planMode: false,
            ...overrides,
        }
    }

    it('writes APM manifest and lock files for saved workspace agents', async () => {
        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            performers: [performer()],
        })

        const manifestPath = path.join(workingDir, '.8pm-studio', 'packages', 'agent-1', 'apm.yml')
        const lockPath = path.join(workingDir, '.8pm-studio', 'packages', 'agent-1', 'apm.lock.yaml')

        await expect(fs.access(manifestPath)).resolves.toBeUndefined()
        await expect(fs.access(lockPath)).resolves.toBeUndefined()

        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg?.manifest.name).toBe('review-agent')
        expect(pkg?.manifest['x-8pm']?.agent?.performerName).toBe('Review Agent')
        expect(pkg?.lock?.packages?.[0]?.manifest_hash).toMatch(/^sha256:/)
    })

    it('lists APM packages and exposes agent projection snapshots from manifests', async () => {
        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            performers: [performer({ id: 'agent-2', name: 'Planner' })],
        })

        const packages = await listApmPackages(workingDir)
        const snapshots = await listApmAgentProjectionSnapshots(workingDir)

        expect(packages).toEqual([
            expect.objectContaining({
                packageId: 'agent-2',
                name: 'planner',
                source: 'apm',
                kind: 'agent',
            }),
        ])
        expect(snapshots).toEqual([
            expect.objectContaining({
                id: 'agent-2',
                name: 'Planner',
                danceRefs: [{ kind: 'registry', urn: 'dance/@acme/prod/review' }],
            }),
        ])
    })

    it('preserves unknown APM fields and x-8pm metadata through import', async () => {
        const imported = await importApmPackage(workingDir, {
            packageId: 'custom',
            manifest: {
                name: 'custom',
                version: '1.2.3',
                customField: { kept: true },
                'x-8pm': {
                    schemaVersion: 1,
                    packageId: 'custom',
                    kind: 'agent',
                },
            },
        })

        expect(imported.manifest.customField).toEqual({ kept: true })
        expect(imported.manifest['x-8pm']?.packageId).toBe('custom')
        expect(validateApmPackageManifest(imported.manifest).valid).toBe(true)
    })

    it('generates deterministic lock hashes for identical manifests', () => {
        const manifest = {
            name: 'stable',
            version: '1.0.0',
            b: { z: 1, a: 2 },
            a: ['x'],
            'x-8pm': {
                schemaVersion: 1,
                packageId: 'stable',
                kind: 'agent',
            },
        } as const

        expect(buildApmLockForManifest(manifest)).toEqual(buildApmLockForManifest({
            ...manifest,
            b: { a: 2, z: 1 },
        }))
    })
})
