import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
    buildApmLockForManifest,
    validateApmPackageManifest,
} from './manifest.js'
import {
    copyApmPackage,
    importApmPackage,
    listApmAgentProjectionSnapshots,
    listApmPackages,
    readApmPackage,
    writeApmPackage,
} from './repository.js'
import {
    readApmWorkspaceSnapshotForDir,
    writeApmPackagesForWorkspace,
} from './workspace.js'
import { createDraft } from '../drafts/service.js'
import type { WorkspaceAgentSnapshot } from '../../../shared/workspace-contracts.js'

describe('apm package storage', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-apm-'))
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    function agent(overrides: Partial<WorkspaceAgentSnapshot> = {}): WorkspaceAgentSnapshot {
        return {
            id: 'agent-1',
            name: 'Review Agent',
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            modelVariant: null,
            agentBody: 'Serve as a careful reviewer.',
            skillRefs: [{ kind: 'registry', urn: '/@acme/prod/review' }],
            mcpServerNames: ['github'],
            runtimeAgentId: null,
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
            agents: [agent()],
        })

        const manifestPath = path.join(workingDir, 'packages', 'agent-1', 'apm.yml')
        const lockPath = path.join(workingDir, 'packages', 'agent-1', 'apm.lock.yaml')

        await expect(fs.access(manifestPath)).resolves.toBeUndefined()
        await expect(fs.access(lockPath)).resolves.toBeUndefined()
        await expect(fs.readFile(path.join(workingDir, 'apm.yml'), 'utf-8'))
            .resolves.toContain('./packages/agent-1')

        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg?.manifest.name).toBe('review-agent')
        expect(pkg?.manifest.description).toBe('Find correctness and regression risks.')
        expect(pkg?.manifest.includes).toBe('auto')
        expect(pkg?.manifest.type).toBe('hybrid')
        expect(pkg?.manifest['x-apm']?.agent?.agentName).toBe('Review Agent')
        expect(pkg?.manifest['x-apm']?.agent?.description).toBe('Find correctness and regression risks.')
        expect(pkg?.manifest['x-apm']?.agent?.agentBody).toBe('Serve as a careful reviewer.')
        expect(pkg?.lock?.packages?.[0]?.manifest_hash).toMatch(/^sha256:/)
    })

    it('materializes Microsoft APM source primitives for saved agents', async () => {
        await createDraft(workingDir, {
            id: 'skill-1',
            kind: 'skill',
            name: 'Review Skill',
            description: 'Review helper',
            content: 'Check tests and edge cases.',
        })

        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            agents: [agent({
                skillRefs: [{ kind: 'draft', draftId: 'skill-1' }],
            })],
        })

        const packageRoot = path.join(workingDir, 'packages', 'agent-1')
        const agentPath = path.join(packageRoot, '.apm', 'agents', 'review-agent.agent.md')
        const skillPath = path.join(packageRoot, '.apm', 'skills', 'review-skill', 'SKILL.md')

        const agentContent = await fs.readFile(agentPath, 'utf-8')
        expect(agentContent).toContain('description: Find correctness and regression risks.')
        expect(agentContent).toContain('Serve as a careful reviewer.')
        expect(agentContent).not.toContain('Review code with care.')
        expect(agentContent).not.toContain('skills:')
        await expect(fs.access(path.join(packageRoot, '.apm', 'instructions'))).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.readFile(skillPath, 'utf-8')).resolves.toContain('Check tests and edge cases.')
        await expect(fs.access(path.join(packageRoot, '.apm', 'skills', 'review-skill', 'draft.json'))).rejects.toMatchObject({ code: 'ENOENT' })

        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg?.microsoftApm?.primitiveCounts).toEqual({
            agents: 1,
            instructions: 0,
            skills: 1,
            prompts: 0,
            commands: 0,
            hooks: 0,
            mcp: 1,
        })
        expect(pkg?.microsoftApm?.installCommand).toBe('apm install ./packages/agent-1 --target codex')
        expect(pkg?.microsoftApm?.warnings).toEqual([])
    })

    it('lists APM packages and exposes agent projection snapshots from manifests', async () => {
        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            agents: [agent({ id: 'agent-2', name: 'Planner' })],
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
                skillRefs: [{ kind: 'registry', urn: '/@acme/prod/review' }],
            }),
        ])
    })

    it('does not read removed .apm-studio package storage', async () => {
        const removedPackageRoot = path.join(workingDir, '.apm-studio', 'packages', 'removed-agent')
        await fs.mkdir(removedPackageRoot, { recursive: true })
        await fs.writeFile(path.join(removedPackageRoot, 'apm.yml'), [
            'name: removed-agent',
            'version: 1.0.0',
            'type: agent',
            'x-apm:',
            '  schemaVersion: 1',
            '  packageId: removed-agent',
            '  kind: agent',
            '  agent:',
            '    id: removed-agent',
            '    agentName: Removed Agent',
        ].join('\n'), 'utf-8')
        await fs.writeFile(path.join(workingDir, '.apm-studio', 'workspace.json'), JSON.stringify({
            schemaVersion: 1,
            product: 'APM Studio',
            workingDir,
            savedAt: 1,
            activePackageIds: ['removed-agent'],
            workspace: {
                workingDir,
                agents: [agent({ id: 'removed-agent', name: 'Removed Agent' })],
            },
        }), 'utf-8')

        await expect(listApmPackages(workingDir)).resolves.toEqual([])
        await expect(readApmWorkspaceSnapshotForDir(workingDir)).resolves.toEqual(expect.objectContaining({
            workingDir,
            agents: [],
        }))
    })

    it('preserves imported primitive packages when saving workspace agents', async () => {
        await writeApmPackage(workingDir, 'skill-1', {
            name: 'review-skill-package',
            version: '1.0.0',
            type: 'skill',
            'x-apm': {
                schemaVersion: 1,
                packageId: 'skill-1',
                kind: 'skill',
            },
        })

        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            agents: [agent({ id: 'agent-1', name: 'Planner' })],
        })

        const packages = await listApmPackages(workingDir)
        expect(packages.map((pkg) => pkg.packageId)).toEqual(['skill-1', 'agent-1'])
        await expect(fs.readFile(path.join(workingDir, '.apm-studio', 'workspace.json'), 'utf-8'))
            .resolves.toContain('"activePackageIds": [\n    "skill-1",\n    "agent-1"\n  ]')
    })

    it('materializes installed skill package references into saved agent packages', async () => {
        await writeApmPackage(workingDir, 'skill-pack', {
            name: 'review-skill-package',
            version: '1.0.0',
            type: 'skill',
            includes: 'auto',
            skills: [{ path: '.apm/skills/review/SKILL.md' }],
            'x-apm': {
                schemaVersion: 1,
                packageId: 'skill-pack',
                kind: 'skill',
            },
        })
        const skillDir = path.join(workingDir, 'packages', 'skill-pack', '.apm', 'skills', 'review')
        await fs.mkdir(skillDir, { recursive: true })
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Review Skill\n\nCheck tests and edge cases.\n', 'utf-8')

        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            agents: [agent({
                skillRefs: [{ kind: 'registry', urn: 'apm-package/workspace/skill-pack' }],
            })],
        })

        await expect(fs.readFile(path.join(workingDir, 'packages', 'agent-1', '.apm', 'skills', 'review', 'SKILL.md'), 'utf-8'))
            .resolves.toContain('Check tests and edge cases.')
        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg?.microsoftApm?.warnings).toEqual([])
    })

    it('ignores workspace documents outside the current Studio schema', async () => {
        await fs.mkdir(path.join(workingDir, '.apm-studio'), { recursive: true })
        await fs.writeFile(path.join(workingDir, '.apm-studio', 'workspace.json'), JSON.stringify({
            workspace: {
                agents: [agent({ id: 'stale-agent', name: 'Stale Agent' })],
            },
        }), 'utf-8')

        await expect(readApmWorkspaceSnapshotForDir(workingDir)).resolves.toBeNull()
    })

    it('does not hydrate agents from workspace UI cache without package manifests', async () => {
        await fs.mkdir(path.join(workingDir, '.apm-studio'), { recursive: true })
        await fs.writeFile(path.join(workingDir, '.apm-studio', 'workspace.json'), JSON.stringify({
            schemaVersion: 1,
            product: 'APM Studio',
            workingDir,
            savedAt: 1,
            activePackageIds: [],
            workspace: {
                workingDir,
                agents: [{
                    id: 'agent-1',
                    name: 'Review Agent',
                    model: { provider: 'openai', modelId: 'gpt-5.4' },
                    skillRefs: [{ kind: 'registry', urn: '/@acme/prod/review' }],
                    mcpServerNames: ['github'],
                    unknownInstructionField: '/old/instruction',
                    skillUrns: ['/old/skill'],
                    orphanedRuntimeId: 'runtime-1',
                }],
            },
        }), 'utf-8')

        const workspace = await readApmWorkspaceSnapshotForDir(workingDir)
        expect(workspace).toEqual(expect.objectContaining({
            workingDir,
            agents: [],
        }))
    })

    it('hydrates workspace package fields from APM manifests while preserving UI state', async () => {
        await writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            agents: [{
                ...agent({
                    name: 'Workspace Copy',
                    agentBody: 'Stale workspace instruction.',
                }),
                position: { x: 120, y: 80 },
                width: 360,
                height: 260,
                mcpBindingMap: { github: 'github-local' },
            }],
        })

        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg).not.toBeNull()
        if (!pkg) return

        const agentExtension = pkg.manifest['x-apm']?.agent
        expect(agentExtension).toBeTruthy()
        if (!agentExtension) return

        await writeApmPackage(workingDir, 'agent-1', {
            ...pkg.manifest,
            'x-apm': {
                ...pkg.manifest['x-apm'],
                schemaVersion: 1,
                packageId: 'agent-1',
                kind: 'agent',
                agent: {
                    ...agentExtension,
                    agentName: 'Manifest Agent',
                    agentBody: 'Manifest agent body wins.',
                },
            },
        })

        const workspaceFile = path.join(workingDir, '.apm-studio', 'workspace.json')
        const workspaceDocument = JSON.parse(await fs.readFile(workspaceFile, 'utf-8'))
        workspaceDocument.workspace.agents[0].unknownNameField = 'Do not keep me'
        workspaceDocument.workspace.agents[0].unknownInstructionField = '/old/instruction'
        workspaceDocument.workspace.agents[0].mcpBindingMap = {
            github: 'github-local',
            broken: 12,
        }
        await fs.writeFile(workspaceFile, JSON.stringify(workspaceDocument, null, 2), 'utf-8')

        const workspace = await readApmWorkspaceSnapshotForDir(workingDir)
        const loadedAgent = workspace?.agents?.[0] as Record<string, unknown> | undefined

        expect(loadedAgent).toEqual(expect.objectContaining({
            id: 'agent-1',
            name: 'Manifest Agent',
            agentBody: 'Manifest agent body wins.',
            position: { x: 120, y: 80 },
            width: 360,
            height: 260,
            mcpBindingMap: { github: 'github-local' },
        }))
        expect(loadedAgent).not.toHaveProperty('unknownNameField')
        expect(loadedAgent).not.toHaveProperty('unknownInstructionField')
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

    it('copies a package directory between APM scopes and keeps source primitives intact', async () => {
        const userDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-user-'))
        try {
            await writeApmPackage(userDir, 'skill-pack', {
                name: 'review-skill-package',
                version: '1.0.0',
                type: 'skill',
                skills: [{ path: '.apm/skills/review/SKILL.md' }],
                'x-apm': {
                    schemaVersion: 1,
                    packageId: 'skill-pack',
                    kind: 'skill',
                },
            })
            const skillDir = path.join(userDir, 'packages', 'skill-pack', '.apm', 'skills', 'review')
            await fs.mkdir(skillDir, { recursive: true })
            await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Review Skill\n\nCheck tests.\n', 'utf-8')

            const copied = await copyApmPackage(userDir, workingDir, 'skill-pack')

            expect(copied.packageId).toBe('skill-pack')
            await expect(fs.readFile(path.join(workingDir, 'packages', 'skill-pack', '.apm', 'skills', 'review', 'SKILL.md'), 'utf-8'))
                .resolves.toContain('Check tests.')
            await expect(fs.readFile(path.join(workingDir, 'apm.yml'), 'utf-8'))
                .resolves.toContain('./packages/skill-pack')
        } finally {
            await fs.rm(userDir, { recursive: true, force: true }).catch(() => {})
        }
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
