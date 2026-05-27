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
    readApmWorkspaceSnapshotForDir,
    validateApmPackageManifest,
    writeApmPackage,
    writeApmPackagesForWorkspace,
} from './apm-package-service.js'
import { createDraft } from './draft-service.js'
import type { WorkspacePerformerSnapshot } from './workspace-service.js'

describe('apm package service', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-apm-'))
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
            inlineInstruction: 'Act as a careful reviewer.',
            talRef: { kind: 'draft', draftId: 'instruction-1' },
            danceRefs: [{ kind: 'registry', urn: 'dance/@acme/prod/review' }],
            mcpServerNames: ['github'],
            agentId: null,
            planMode: false,
            meta: {
                authoring: {
                    description: 'Find correctness and regression risks.',
                },
            },
            ...overrides,
        }
    }

    it('writes APM manifest and lock files for saved workspace agents', async () => {
        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            performers: [performer()],
        })

        const manifestPath = path.join(workingDir, '.apm-studio', 'packages', 'agent-1', 'apm.yml')
        const lockPath = path.join(workingDir, '.apm-studio', 'packages', 'agent-1', 'apm.lock.yaml')

        await expect(fs.access(manifestPath)).resolves.toBeUndefined()
        await expect(fs.access(lockPath)).resolves.toBeUndefined()

        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg?.manifest.name).toBe('review-agent')
        expect(pkg?.manifest.description).toBe('Find correctness and regression risks.')
        expect(pkg?.manifest.includes).toBe('auto')
        expect(pkg?.manifest.type).toBe('hybrid')
        expect(pkg?.manifest['x-apm']?.agent?.agentName).toBe('Review Agent')
        expect(pkg?.manifest['x-apm']?.agent?.description).toBe('Find correctness and regression risks.')
        expect(pkg?.manifest['x-apm']?.agent?.agentBody).toBe('Act as a careful reviewer.')
        expect(pkg?.lock?.packages?.[0]?.manifest_hash).toMatch(/^sha256:/)
    })

    it('materializes Microsoft APM source primitives for saved agents', async () => {
        await createDraft(workingDir, {
            id: 'instruction-1',
            kind: 'tal',
            name: 'Review Instruction',
            content: 'Review code with care.',
        })
        await createDraft(workingDir, {
            id: 'skill-1',
            kind: 'dance',
            name: 'Review Skill',
            description: 'Review helper',
            content: 'Check tests and edge cases.',
        })

        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            performers: [performer({
                danceRefs: [{ kind: 'draft', draftId: 'skill-1' }],
            })],
        })

        const packageRoot = path.join(workingDir, '.apm-studio', 'packages', 'agent-1')
        const agentPath = path.join(packageRoot, '.apm', 'agents', 'review-agent.agent.md')
        const instructionPath = path.join(packageRoot, '.apm', 'instructions', 'review-agent.instructions.md')
        const skillPath = path.join(packageRoot, '.apm', 'skills', 'review-skill', 'SKILL.md')

        const agentContent = await fs.readFile(agentPath, 'utf-8')
        expect(agentContent).toContain('description: Find correctness and regression risks.')
        expect(agentContent).toContain('Act as a careful reviewer.')
        expect(agentContent).not.toContain('Review code with care.')
        expect(agentContent).not.toContain('skills:')
        await expect(fs.readFile(instructionPath, 'utf-8')).resolves.toContain('Review code with care.')
        await expect(fs.readFile(skillPath, 'utf-8')).resolves.toContain('Check tests and edge cases.')
        await expect(fs.access(path.join(packageRoot, '.apm', 'skills', 'review-skill', 'draft.json'))).rejects.toMatchObject({ code: 'ENOENT' })

        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg?.microsoftApm?.primitiveCounts).toEqual({
            agents: 1,
            instructions: 1,
            skills: 1,
        })
        expect(pkg?.microsoftApm?.installCommand).toBe('apm install .apm-studio/packages/agent-1 --target codex')
        expect(pkg?.microsoftApm?.warnings).toEqual([])
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

    it('hydrates workspace package fields from APM manifests while preserving UI state', async () => {
        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            performers: [{
                ...performer({
                    name: 'Workspace Copy',
                    inlineInstruction: 'Stale workspace instruction.',
                }),
                position: { x: 120, y: 80 },
                width: 360,
                height: 260,
            }],
        })

        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg).not.toBeNull()
        if (!pkg) return

        const agent = pkg.manifest['x-apm']?.agent
        expect(agent).toBeTruthy()
        if (!agent) return

        await writeApmPackage(workingDir, 'agent-1', {
            ...pkg.manifest,
            'x-apm': {
                ...pkg.manifest['x-apm'],
                schemaVersion: 1,
                packageId: 'agent-1',
                kind: 'agent',
                agent: {
                    ...agent,
                    agentName: 'Manifest Agent',
                    agentBody: 'Manifest agent body wins.',
                },
            },
        })

        const workspace = await readApmWorkspaceSnapshotForDir(workingDir)

        expect(workspace?.performers?.[0]).toEqual(expect.objectContaining({
            id: 'agent-1',
            name: 'Manifest Agent',
            inlineInstruction: 'Manifest agent body wins.',
            position: { x: 120, y: 80 },
            width: 360,
            height: 260,
        }))
    })

    it('preserves unknown APM fields and x-apm metadata through import', async () => {
        const imported = await importApmPackage(workingDir, {
            packageId: 'custom',
            manifest: {
                name: 'custom',
                version: '1.2.3',
                customField: { kept: true },
                'x-apm': {
                    schemaVersion: 1,
                    packageId: 'custom',
                    kind: 'agent',
                },
            },
        })

        expect(imported.manifest.customField).toEqual({ kept: true })
        expect(imported.manifest['x-apm']?.packageId).toBe('custom')
        expect(validateApmPackageManifest(imported.manifest).valid).toBe(true)
    })

    it('generates deterministic lock hashes for identical manifests', () => {
        const manifest = {
            name: 'stable',
            version: '1.0.0',
            b: { z: 1, a: 2 },
            a: ['x'],
            'x-apm': {
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
