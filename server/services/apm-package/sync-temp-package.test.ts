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

    it('copies the full package root for agent package sync', async () => {
        const workingDir = await createWorkingDir()
        try {
            await writePackageWithSkill(workingDir)

            const tempPackage = await createTrackedTempPackage(workingDir, 'agent-packages')

            await expect(fs.readFile(path.join(tempPackage.packageRoot, 'apm.yml'), 'utf-8'))
                .resolves.toContain('Planner')
            await expect(fs.readFile(path.join(tempPackage.packageRoot, '.apm', 'skills', 'review', 'SKILL.md'), 'utf-8'))
                .resolves.toContain('Review')
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
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('keeps MCP dependencies only for package and MCP sync units', () => {
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
    })
})
