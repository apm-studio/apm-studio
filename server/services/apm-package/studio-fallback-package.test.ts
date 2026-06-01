import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildApmManifestForAgent } from './manifest.js'
import { writeApmPackage } from './repository.js'
import { loadStudioFallbackSyncPackage } from './studio-fallback-package.js'

describe('loadStudioFallbackSyncPackage', () => {
    it('loads a Studio package snapshot for fallback projection', async () => {
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-fallback-package-'))

        try {
            await writeApmPackage(workingDir, 'agent-1', buildApmManifestForAgent({
                id: 'agent-1',
                name: 'Planning Agent',
                model: {
                    provider: 'openai',
                    modelId: 'gpt-5',
                },
                agentBody: 'Plan carefully.',
                skillRefs: [],
                mcpServerNames: ['playwright'],
                meta: {
                    authoring: {
                        description: 'Plans work in clear steps.',
                    },
                },
            }))
            const skillDir = path.join(workingDir, 'packages', 'agent-1', '.apm', 'skills', 'review')
            await fs.mkdir(skillDir, { recursive: true })
            await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Review\n', 'utf-8')

            const syncPackage = await loadStudioFallbackSyncPackage(workingDir, 'agent-1')

            expect(syncPackage).toEqual(expect.objectContaining({
                hasAgent: true,
                packageId: 'agent-1',
                name: 'Planning Agent',
                slug: 'planning-agent',
                description: 'Plans work in clear steps.',
                agentBody: 'Plan carefully.',
                model: {
                    provider: 'openai',
                    modelId: 'gpt-5',
                },
                mcpServerNames: ['playwright'],
                skills: [expect.objectContaining({
                    name: 'review',
                    dir: skillDir,
                })],
            }))
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })
})
