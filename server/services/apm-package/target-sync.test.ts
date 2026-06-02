import { afterEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ExecFileException } from 'node:child_process'
import { buildApmManifestForAgent } from './manifest.js'
import { writeApmPackage } from './repository.js'
import { writePackageFiles } from './package-files.js'
import { packageDir } from './paths.js'

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
        agentBody: 'Plan carefully.',
        skillRefs: [],
        mcpServerNames: [],
    }))
}

async function writeHookPackage(workingDir: string, packageId: string, name: string, eventName: string) {
    await writePackageFiles(workingDir, packageId, {
        name,
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        target: ['claude'],
        dependencies: { apm: [], mcp: [] },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'hook',
        },
    })
    const hookDir = path.join(packageDir(workingDir, packageId), '.apm', 'hooks')
    await fs.mkdir(hookDir, { recursive: true })
    await fs.writeFile(path.join(hookDir, 'claude-hooks.json'), JSON.stringify({
        hooks: {
            [eventName]: [{
                matcher: '',
                hooks: [{ type: 'command', command: `echo ${packageId}` }],
            }],
        },
    }), 'utf-8')
}

async function writeMcpPackage(workingDir: string, packageId: string, serverName: string) {
    await writePackageFiles(workingDir, packageId, {
        name: packageId,
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        dependencies: {
            apm: [],
            mcp: [{
                name: serverName,
                registry: false,
                transport: 'stdio',
                command: 'node',
                args: ['-e', `console.log(${JSON.stringify(serverName)})`],
            }],
        },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'mcp',
        },
    })
}

describe('APM target sync', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        execFileMock.mockReset()
        vi.resetModules()
    })

    it('reports CLI-first sync targets and supported sync units', async () => {
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
            supportedSyncUnits: expect.arrayContaining(['agents', 'skills', 'hooks']),
        }))
        expect(response.targets.find((target) => target.id === 'codex')?.supportedSyncUnits).not.toContain('studio-agent')
        expect(response.targets.find((target) => target.id === 'gemini')?.supportedSyncUnits).not.toContain('agents')
        expect(response.targets.find((target) => target.id === 'gemini')?.supportedSyncUnits).toEqual(expect.arrayContaining(['commands', 'hooks']))
        expect(response.targets.find((target) => target.id === 'agent-skills')?.supportedSyncUnits).toEqual(['skills'])
        expect(response.tooling.deploymentNote).toContain('CLI-first')
    })

    it('annotates target summaries with upstream APM target detection output', async () => {
        execFileMock.mockImplementation((command: string, args: string[], _options: unknown, callback: ExecCallback) => {
            if (command === 'apm' && args.includes('targets')) {
                callback(null, JSON.stringify([
                    {
                        target: 'codex',
                        status: 'active',
                        source: '.codex/',
                        deploy_dir: '.codex/',
                        needs: null,
                    },
                    {
                        target: 'gemini',
                        status: 'inactive',
                        source: null,
                        deploy_dir: '.gemini/',
                        needs: 'GEMINI.md',
                    },
                ]), '')
                return
            }
            callback(command === 'apm' ? null : new Error('missing') as ExecFileException, 'apm 1.2.3', '')
        })
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-detection-'))
        const { getApmSyncTargets } = await import('./target-sync.js')

        try {
            const response = await getApmSyncTargets(workingDir)
            expect(response.targets.find((target) => target.id === 'codex')).toEqual(expect.objectContaining({
                apmCliStatus: 'active',
                apmCliSource: '.codex/',
                apmCliDeployDir: '.codex/',
            }))
            expect(response.targets.find((target) => target.id === 'gemini')).toEqual(expect.objectContaining({
                apmCliStatus: 'inactive',
                apmCliDeployDir: '.gemini/',
                apmCliNeeds: 'GEMINI.md',
            }))
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
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
                    syncUnit: 'agents',
                    path: '.codex/agents/planner.toml',
                    managed: false,
                }),
                expect.objectContaining({
                    name: 'reviewer',
                    kind: 'skill',
                    syncUnit: 'skills',
                    path: '.agents/skills/reviewer/SKILL.md',
                    managed: false,
                }),
            ]))
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('falls back to Codex agent sync without writing the Studio runtime model', async () => {
        mockMissingCli()
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-codex-'))
        const { getApmSyncTargets, runApmTargetSync } = await import('./target-sync.js')

        try {
            await writePlannerPackage(workingDir)

            const response = await runApmTargetSync(workingDir, {
                targets: ['codex'],
                syncUnit: 'agents',
                packageIds: ['agent-1'],
            })
            const codexAgent = await fs.readFile(path.join(workingDir, '.codex', 'agents', 'planner.toml'), 'utf-8')

            expect(response.syncUnit).toBe('agents')
            expect(response.results[0]).toEqual(expect.objectContaining({
                packageId: 'agent-1',
                target: 'codex',
                syncUnit: 'agents',
                status: 'synced',
                projectedAs: 'Codex subagent',
                modelOmitted: true,
                artifacts: expect.arrayContaining(['.codex/agents/planner.toml']),
            }))
            expect(codexAgent).toContain('developer_instructions = "Plan carefully."')
            expect(codexAgent).not.toContain('gpt-5.4')
            expect(codexAgent).not.toContain('model')
            const ownership = JSON.parse(await fs.readFile(path.join(workingDir, '.apm-studio', 'projections', 'apm-sync.json'), 'utf-8'))
            expect(ownership.files['.codex/agents/planner.toml']).toEqual(expect.objectContaining({
                packageId: 'agent-1',
                target: 'codex',
                syncUnit: 'agents',
                source: 'studio-fallback',
            }))
            await expect(fs.stat(path.join(workingDir, '.apm-studio', 'projections', 'studio-fallback-sync.json'))).rejects.toMatchObject({ code: 'ENOENT' })
            const targets = await getApmSyncTargets(workingDir)
            const codex = targets.targets.find((entry) => entry.id === 'codex')
            expect(codex?.currentItems).toEqual([
                expect.objectContaining({
                    packageId: 'agent-1',
                    syncUnit: 'agents',
                    artifacts: ['.codex/agents/planner.toml'],
                }),
            ])
            expect(codex?.definitions).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    path: '.codex/agents/planner.toml',
                    managed: true,
                    managedPackageId: 'agent-1',
                    managedSyncUnit: 'agents',
                }),
            ]))
            expect(execFileMock).toHaveBeenCalled()
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('seeds existing merged hook config so multiple hook packages stay merged', async () => {
        execFileMock.mockImplementation((command: string, args: string[], options: { cwd?: string }, callback: ExecCallback) => {
            if (args.includes('--version')) {
                callback(command === 'apm' ? null : new Error('missing') as ExecFileException, 'apm 1.2.3', '')
                return
            }
            if (command !== 'apm' || !args.includes('install') || !options.cwd) {
                callback(new Error(`Unexpected APM CLI call: ${command} ${args.join(' ')}`) as ExecFileException)
                return
            }
            void (async () => {
                const packageRoot = args[args.indexOf('install') + 1]
                const hookData = JSON.parse(await fs.readFile(path.join(packageRoot, '.apm', 'hooks', 'claude-hooks.json'), 'utf-8')) as { hooks: Record<string, unknown[]> }
                const settingsPath = path.join(options.cwd || '', '.claude', 'settings.json')
                const existing = await fs.readFile(settingsPath, 'utf-8').then((raw) => JSON.parse(raw) as { hooks?: Record<string, unknown[]> }).catch(() => ({ hooks: {} }))
                const hooks: Record<string, unknown[]> = existing.hooks || {}
                for (const [eventName, entries] of Object.entries(hookData.hooks)) {
                    hooks[eventName] = [...(hooks[eventName] || []), ...entries]
                }
                await fs.mkdir(path.dirname(settingsPath), { recursive: true })
                await fs.writeFile(settingsPath, `${JSON.stringify({ ...existing, hooks }, null, 2)}\n`, 'utf-8')
            })()
                .then(() => callback(null, 'merged hooks', ''))
                .catch((error) => callback(error as ExecFileException))
        })
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-hooks-'))
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writeHookPackage(workingDir, 'repo-one-hooks', 'repo-one-hooks', 'PreToolUse')
            await writeHookPackage(workingDir, 'repo-two-hooks', 'repo-two-hooks', 'PostToolUse')

            const response = await runApmTargetSync(workingDir, {
                targets: ['claude'],
                syncUnit: 'hooks',
                packageIds: ['repo-one-hooks', 'repo-two-hooks'],
            })
            const settings = JSON.parse(await fs.readFile(path.join(workingDir, '.claude', 'settings.json'), 'utf-8')) as { hooks: Record<string, unknown[]> }

            expect(response.results).toEqual([
                expect.objectContaining({ packageId: 'repo-one-hooks', status: 'synced' }),
                expect.objectContaining({ packageId: 'repo-two-hooks', status: 'synced' }),
            ])
            expect(Object.keys(settings.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse'])
            expect(JSON.stringify(settings.hooks.PreToolUse)).toContain('repo-one-hooks')
            expect(JSON.stringify(settings.hooks.PostToolUse)).toContain('repo-two-hooks')
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('seeds existing MCP config so multiple MCP packages stay merged', async () => {
        execFileMock.mockImplementation((command: string, args: string[], options: { cwd?: string }, callback: ExecCallback) => {
            if (args.includes('--version')) {
                callback(command === 'apm' ? null : new Error('missing') as ExecFileException, 'apm 1.2.3', '')
                return
            }
            if (command !== 'apm' || !args.includes('install') || !options.cwd) {
                callback(new Error(`Unexpected APM CLI call: ${command} ${args.join(' ')}`) as ExecFileException)
                return
            }
            void (async () => {
                const packageRoot = args[args.indexOf('install') + 1]
                const packageId = path.basename(packageRoot)
                const serverName = packageId === 'mcp-one' ? 'filesystem-one' : 'filesystem-two'
                const mcpPath = path.join(options.cwd || '', '.cursor', 'mcp.json')
                const existing = await fs.readFile(mcpPath, 'utf-8')
                    .then((raw) => JSON.parse(raw) as { mcpServers?: Record<string, unknown> })
                    .catch((): { mcpServers: Record<string, unknown> } => ({ mcpServers: {} }))
                const mcpServers: Record<string, unknown> = existing.mcpServers || {}
                mcpServers[serverName] = { command: 'node', args: ['-e', `console.log("${serverName}")`] }
                await fs.mkdir(path.dirname(mcpPath), { recursive: true })
                await fs.writeFile(mcpPath, `${JSON.stringify({ ...existing, mcpServers }, null, 2)}\n`, 'utf-8')
            })()
                .then(() => callback(null, 'merged mcp', ''))
                .catch((error) => callback(error as ExecFileException))
        })
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-mcp-'))
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writeMcpPackage(workingDir, 'mcp-one', 'filesystem-one')
            await writeMcpPackage(workingDir, 'mcp-two', 'filesystem-two')

            const response = await runApmTargetSync(workingDir, {
                targets: ['cursor'],
                syncUnit: 'mcp',
                packageIds: ['mcp-one', 'mcp-two'],
            })
            const config = JSON.parse(await fs.readFile(path.join(workingDir, '.cursor', 'mcp.json'), 'utf-8')) as { mcpServers: Record<string, unknown> }

            expect(response.results).toEqual([
                expect.objectContaining({ packageId: 'mcp-one', status: 'synced' }),
                expect.objectContaining({ packageId: 'mcp-two', status: 'synced' }),
            ])
            expect(Object.keys(config.mcpServers).sort()).toEqual(['filesystem-one', 'filesystem-two'])
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('rejects unsupported sync units instead of silently defaulting', async () => {
        mockMissingCli()
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-invalid-unit-'))
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writePlannerPackage(workingDir)
            const invalidRequest = {
                targets: ['codex'],
                syncUnit: 'unknown',
                packageIds: ['agent-1'],
            } as unknown as Parameters<typeof runApmTargetSync>[1]

            await expect(runApmTargetSync(workingDir, invalidRequest))
                .rejects.toThrow('Unsupported APM sync unit: unknown')
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
                targets: ['codex'],
                syncUnit: 'agents',
                packageIds: ['agent-1'],
            })

            expect(response.results[0]).toEqual(expect.objectContaining({
                packageId: 'agent-1',
                target: 'codex',
                syncUnit: 'agents',
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

    it('does not replace a selected APM CLI failure with Studio fallback output', async () => {
        execFileMock.mockImplementation((command: string, args: string[], _options: unknown, callback: ExecCallback) => {
            if (command === 'apm' && args.includes('install')) {
                callback(new Error('APM install failed') as ExecFileException, '', 'boom')
                return
            }
            callback(command === 'apm' ? null : new Error('missing') as ExecFileException, 'apm 1.2.3', '')
        })
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-cli-fail-'))
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writePlannerPackage(workingDir)

            const response = await runApmTargetSync(workingDir, {
                targets: ['codex'],
                syncUnit: 'agents',
                packageIds: ['agent-1'],
            })

            expect(response.results[0]).toEqual(expect.objectContaining({
                packageId: 'agent-1',
                target: 'codex',
                syncUnit: 'agents',
                status: 'failed',
                command: 'apm install <package> --target codex',
                error: 'APM install failed',
                warnings: expect.arrayContaining([
                    expect.stringContaining('Studio did not replace the failed APM output'),
                ]),
            }))
            await expect(fs.stat(path.join(workingDir, '.codex', 'agents', 'planner.toml')))
                .rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('skips unsupported agent targets and falls back for shared skills', async () => {
        mockMissingCli()
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-skills-'))
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writePlannerPackage(workingDir)
            const skillDir = path.join(workingDir, 'packages', 'agent-1', '.apm', 'skills', 'review')
            await fs.mkdir(skillDir, { recursive: true })
            await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: review\n---\n\nReview carefully.\n', 'utf-8')

            const unsupported = await runApmTargetSync(workingDir, {
                targets: ['gemini'],
                syncUnit: 'agents',
                packageIds: ['agent-1'],
            })
            expect(unsupported.results[0]).toEqual(expect.objectContaining({
                target: 'gemini',
                status: 'skipped',
            }))

            const skills = await runApmTargetSync(workingDir, {
                targets: ['agent-skills'],
                syncUnit: 'skills',
                packageIds: ['agent-1'],
            })

            expect(skills.results[0]).toEqual(expect.objectContaining({
                target: 'agent-skills',
                syncUnit: 'skills',
                status: 'synced',
                artifacts: expect.arrayContaining(['.agents/skills/review/SKILL.md']),
            }))

            await writeApmPackage(workingDir, 'skill-only', {
                name: 'standalone-review',
                version: '0.1.0',
                type: 'skill',
                'x-apm': {
                    schemaVersion: 1,
                    packageId: 'skill-only',
                    kind: 'skill',
                },
            })
            const standaloneSkillDir = path.join(workingDir, 'packages', 'skill-only', '.apm', 'skills', 'standalone-review')
            await fs.mkdir(standaloneSkillDir, { recursive: true })
            await fs.writeFile(path.join(standaloneSkillDir, 'SKILL.md'), '# Standalone Review\n', 'utf-8')

            const geminiSkills = await runApmTargetSync(workingDir, {
                targets: ['gemini'],
                syncUnit: 'skills',
                packageIds: ['skill-only'],
            })

            expect(geminiSkills.results[0]).toEqual(expect.objectContaining({
                target: 'gemini',
                syncUnit: 'skills',
                status: 'synced',
                projectedAs: 'Gemini skills',
                artifacts: expect.arrayContaining(['.agents/skills/standalone-review/SKILL.md']),
            }))
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })
})
