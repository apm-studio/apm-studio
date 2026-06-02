import { afterEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { buildApmManifestForAgent } from './manifest.js'
import { writeApmPackage } from './repository.js'
import {
    createSyncTempPackage,
    filteredManifestForSync,
    removeSyncTempPackage,
    type SyncTempPackage,
} from './sync-temp-package.js'

const tempPackages: SyncTempPackage[] = []

async function createWorkingDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'apm-sync-temp-package-'))
}

async function writePackageWithSkill(workingDir: string) {
    await writeApmPackage(workingDir, 'agent-1', buildApmManifestForAgent({
        id: 'agent-1',
        name: 'Planner',
        model: { provider: 'openai', modelId: 'gpt-5.4' },
        agentBody: 'Plan carefully.',
        skillRefs: [],
        mcpServerNames: [],
    }))
    const skillDir = path.join(workingDir, 'packages', 'agent-1', '.apm', 'skills', 'review')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Review\n', 'utf-8')
    const promptDir = path.join(workingDir, 'packages', 'agent-1', '.apm', 'prompts')
    await fs.mkdir(promptDir, { recursive: true })
    await fs.writeFile(path.join(promptDir, 'release.prompt.md'), '# Release\n', 'utf-8')
    const hookDir = path.join(workingDir, 'packages', 'agent-1', '.apm', 'hooks')
    await fs.mkdir(hookDir, { recursive: true })
    await fs.writeFile(path.join(hookDir, 'codex-hooks.json'), '{"hooks":{}}\n', 'utf-8')
}

async function createTrackedTempPackage(workingDir: string, syncUnit: Parameters<typeof createSyncTempPackage>[2]) {
    const tempPackage = await createSyncTempPackage(workingDir, 'agent-1', syncUnit)
    tempPackages.push(tempPackage)
    return tempPackage
}

describe('sync temp package', () => {
    afterEach(async () => {
        await Promise.all(tempPackages.splice(0).map(removeSyncTempPackage))
    })

    it('builds agent-scoped temp packages without exporting the Studio runtime model', async () => {
        const workingDir = await createWorkingDir()
        try {
            await writePackageWithSkill(workingDir)

            const tempPackage = await createTrackedTempPackage(workingDir, 'agents')

            await expect(fs.readFile(path.join(tempPackage.packageRoot, 'apm.yml'), 'utf-8'))
                .resolves.toContain('Planner')
            const agentFile = await fs.readFile(path.join(tempPackage.packageRoot, '.apm', 'agents', 'planner.agent.md'), 'utf-8')
            expect(agentFile).toContain('Plan carefully.')
            expect(agentFile).not.toContain('gpt-5.4')
            await expect(fs.stat(path.join(tempPackage.packageRoot, '.apm', 'skills')))
                .rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('builds primitive-scoped packages without unrelated primitive directories', async () => {
        const workingDir = await createWorkingDir()
        try {
            await writePackageWithSkill(workingDir)

            const tempPackage = await createTrackedTempPackage(workingDir, 'skills')

            await expect(fs.readFile(path.join(tempPackage.packageRoot, '.apm', 'skills', 'review', 'SKILL.md'), 'utf-8'))
                .resolves.toContain('Review')
            await expect(fs.stat(path.join(tempPackage.packageRoot, '.apm', 'agents')))
                .rejects.toMatchObject({ code: 'ENOENT' })
            await expect(fs.stat(path.join(tempPackage.packageRoot, '.apm', 'prompts')))
                .rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('maps prompt source files to both prompt and command temp packages', async () => {
        const workingDir = await createWorkingDir()
        try {
            await writePackageWithSkill(workingDir)

            const promptsPackage = await createTrackedTempPackage(workingDir, 'prompts')
            const commandsPackage = await createTrackedTempPackage(workingDir, 'commands')

            await expect(fs.readFile(path.join(promptsPackage.packageRoot, '.apm', 'prompts', 'release.prompt.md'), 'utf-8'))
                .resolves.toContain('Release')
            await expect(fs.readFile(path.join(commandsPackage.packageRoot, '.apm', 'prompts', 'release.prompt.md'), 'utf-8'))
                .resolves.toContain('Release')
            await expect(fs.stat(path.join(commandsPackage.packageRoot, '.apm', 'skills')))
                .rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('builds hook-scoped temp packages without unrelated primitive directories', async () => {
        const workingDir = await createWorkingDir()
        try {
            await writePackageWithSkill(workingDir)

            const tempPackage = await createTrackedTempPackage(workingDir, 'hooks')

            await expect(fs.readFile(path.join(tempPackage.packageRoot, '.apm', 'hooks', 'codex-hooks.json'), 'utf-8'))
                .resolves.toContain('"hooks"')
            await expect(fs.stat(path.join(tempPackage.packageRoot, '.apm', 'skills')))
                .rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('keeps MCP dependencies only for MCP sync units', () => {
        const manifest = {
            name: 'Planner',
            dependencies: {
                mcp: [{ name: 'github', command: 'github-mcp' }],
            },
        }

        expect(filteredManifestForSync(manifest, 'skills').dependencies?.mcp).toEqual([])
        expect(filteredManifestForSync(manifest, 'mcp').dependencies?.mcp).toEqual([
            { name: 'github', command: 'github-mcp' },
        ])
        expect(filteredManifestForSync(manifest, 'agents').dependencies?.mcp).toEqual([])
    })

    it('normalizes Studio-only package types to Microsoft APM CLI package types', () => {
        expect(filteredManifestForSync({ name: 'Hooks', type: 'hooks' }, 'hooks').type).toBe('hybrid')
        expect(filteredManifestForSync({ name: 'Commands', type: 'commands' }, 'commands').type).toBe('prompts')
    })
})
