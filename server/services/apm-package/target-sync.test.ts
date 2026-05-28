import { afterEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ExecFileException } from 'node:child_process'
import { buildApmManifestForAgent } from './manifest.js'
import { writeApmPackage } from './repository.js'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({
    execFile: execFileMock,
}))

type ExecCallback = (error: ExecFileException | null, stdout?: string, stderr?: string) => void

function mockMissingCli() {
    execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: ExecCallback) => {
        callback(new Error('missing') as ExecFileException)
    })
}

async function writePlannerPackage(workingDir: string) {
    await writeApmPackage(workingDir, 'agent-1', buildApmManifestForAgent({
        id: 'agent-1',
        name: 'Planner',
        model: { provider: 'openai', modelId: 'gpt-5.4' },
        inlineInstruction: 'Plan carefully.',
        danceRefs: [],
        mcpServerNames: [],
    }))
}

describe('APM target sync', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        execFileMock.mockReset()
        vi.resetModules()
    })

    it('reports CLI-first export targets and supported export units', async () => {
        execFileMock.mockImplementation((command: string, _args: string[], _options: unknown, callback: ExecCallback) => {
            callback(command === 'uvx' ? null : new Error('missing') as ExecFileException, 'uvx 0.11.2', '')
        })
        const { getApmSyncTargets } = await import('./target-sync.js')

        const response = await getApmSyncTargets()

        expect(response.targets.map((target) => target.id)).toEqual([
            'codex',
            'claude',
            'opencode',
            'cursor',
            'windsurf',
            'copilot',
            'gemini',
            'agent-skills',
        ])
        expect(response.targets.find((target) => target.id === 'codex')).toEqual(expect.objectContaining({
            available: true,
            commandPreview: expect.stringContaining('uvx --from git+https://github.com/microsoft/apm.git apm'),
            strategy: 'cli-first',
            supportedExportUnits: expect.arrayContaining(['agent-packages', 'agents', 'skills']),
        }))
        expect(response.targets.find((target) => target.id === 'gemini')?.supportedExportUnits).not.toContain('agents')
        expect(response.targets.find((target) => target.id === 'agent-skills')?.supportedExportUnits).toEqual(['skills'])
        expect(response.tooling.deploymentNote).toContain('CLI-first')
    })

    it('reads existing target definition files for each target summary', async () => {
        execFileMock.mockImplementation((command: string, _args: string[], _options: unknown, callback: ExecCallback) => {
            callback(command === 'uvx' ? null : new Error('missing') as ExecFileException, 'uvx 0.11.2', '')
        })
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-definitions-'))
        const { getApmSyncTargets } = await import('./target-sync.js')

        try {
            await fs.mkdir(path.join(workingDir, '.codex', 'agents'), { recursive: true })
            await fs.writeFile(path.join(workingDir, '.codex', 'agents', 'planner.toml'), 'developer_instructions = "Plan carefully."\n', 'utf-8')
            await fs.mkdir(path.join(workingDir, '.agents', 'skills', 'reviewer'), { recursive: true })
            await fs.writeFile(path.join(workingDir, '.agents', 'skills', 'reviewer', 'SKILL.md'), '# Reviewer\n', 'utf-8')

            const response = await getApmSyncTargets(workingDir)
            const codex = response.targets.find((target) => target.id === 'codex')

            expect(codex?.definitions).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    name: 'planner',
                    kind: 'agent',
                    exportUnit: 'agents',
                    path: '.codex/agents/planner.toml',
                    managed: false,
                }),
                expect.objectContaining({
                    name: 'reviewer',
                    kind: 'skill',
                    exportUnit: 'skills',
                    path: '.agents/skills/reviewer/SKILL.md',
                    managed: false,
                }),
            ]))
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('falls back to Codex subagent export without exporting the Studio Run model', async () => {
        mockMissingCli()
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-codex-'))
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writePlannerPackage(workingDir)

            const response = await runApmTargetSync(workingDir, {
                target: 'codex',
                exportUnit: 'agents',
                packageIds: ['agent-1'],
            })
            const codexAgent = await fs.readFile(path.join(workingDir, '.codex', 'agents', 'planner.toml'), 'utf-8')

            expect(response.exportUnit).toBe('agents')
            expect(response.results[0]).toEqual(expect.objectContaining({
                packageId: 'agent-1',
                target: 'codex',
                exportUnit: 'agents',
                status: 'synced',
                projectedAs: 'Codex subagent',
                modelOmitted: true,
                artifacts: expect.arrayContaining(['.codex/agents/planner.toml']),
            }))
            expect(codexAgent).toContain('developer_instructions = "Plan carefully."')
            expect(codexAgent).not.toContain('gpt-5.4')
            expect(codexAgent).not.toContain('model')
            expect(execFileMock).toHaveBeenCalled()
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('uses uvx microsoft/apm when apm is missing and copies CLI artifacts back', async () => {
        execFileMock.mockImplementation((command: string, args: string[], options: { cwd?: string }, callback: ExecCallback) => {
            if (command === 'apm') {
                callback(new Error('missing') as ExecFileException)
                return
            }
            if (command === 'uvx' && args.includes('install')) {
                const cwd = options.cwd || ''
                void fs.mkdir(path.join(cwd, '.codex', 'agents'), { recursive: true })
                    .then(() => fs.writeFile(path.join(cwd, '.codex', 'agents', 'planner.toml'), 'developer_instructions = "Plan carefully."\n', 'utf-8'))
                    .then(() => callback(null, 'installed', ''))
                    .catch((error) => callback(error as ExecFileException))
                return
            }
            callback(command === 'uvx' ? null : new Error('missing') as ExecFileException, 'uvx 0.11.2', '')
        })
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-uvx-'))
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writePlannerPackage(workingDir)

            const response = await runApmTargetSync(workingDir, {
                target: 'codex',
                exportUnit: 'agents',
                packageIds: ['agent-1'],
            })

            expect(response.results[0]).toEqual(expect.objectContaining({
                packageId: 'agent-1',
                target: 'codex',
                exportUnit: 'agents',
                status: 'synced',
                command: expect.stringContaining('uvx --from git+https://github.com/microsoft/apm.git apm install'),
                artifacts: ['.codex/agents/planner.toml'],
            }))
            await expect(fs.readFile(path.join(workingDir, '.codex', 'agents', 'planner.toml'), 'utf-8'))
                .resolves.toContain('Plan carefully')
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('skips unsupported agent package targets and falls back for shared skills', async () => {
        mockMissingCli()
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-skills-'))
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writePlannerPackage(workingDir)
            const skillDir = path.join(workingDir, '.apm-studio', 'packages', 'agent-1', '.apm', 'skills', 'review')
            await fs.mkdir(skillDir, { recursive: true })
            await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: review\n---\n\nReview carefully.\n', 'utf-8')

            const unsupported = await runApmTargetSync(workingDir, {
                target: 'gemini',
                exportUnit: 'agent-packages',
                packageIds: ['agent-1'],
            })
            expect(unsupported.results[0]).toEqual(expect.objectContaining({
                target: 'gemini',
                status: 'skipped',
            }))

            const skills = await runApmTargetSync(workingDir, {
                target: 'agent-skills',
                exportUnit: 'skills',
                packageIds: ['agent-1'],
            })

            expect(skills.results[0]).toEqual(expect.objectContaining({
                target: 'agent-skills',
                exportUnit: 'skills',
                status: 'synced',
                artifacts: expect.arrayContaining(['.agents/skills/review/SKILL.md']),
            }))
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })
})
