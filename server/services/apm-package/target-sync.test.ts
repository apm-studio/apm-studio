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

describe('APM target sync', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.resetModules()
    })

    it('reports APM targets unavailable when the apm CLI is missing', async () => {
        execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (error: ExecFileException | null) => void) => {
            callback(new Error('missing') as ExecFileException)
        })
        const { getApmSyncTargets } = await import('./target-sync.js')

        const response = await getApmSyncTargets()

        expect(response.targets.every((target) => target.available === false)).toBe(true)
        expect(response.targets.map((target) => target.id)).toEqual([
            'codex',
            'gemini',
            'claude',
            'opencode',
            'cursor',
            'windsurf',
            'copilot',
        ])
        expect(response.targets[0].disabledReason).toContain('Microsoft APM CLI')
        expect(response.tooling.recommendedCommand).toBeNull()
    })

    it('uses uvx as the target export runner when apm is not on PATH', async () => {
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-uvx-'))
        execFileMock.mockImplementation((command: string, args: string[], _options: unknown, callback: (error: ExecFileException | null, stdout?: string, stderr?: string) => void) => {
            if (command === 'apm' && args[0] === '--version') {
                callback(new Error('missing') as ExecFileException)
                return
            }
            if (command === 'uvx' && args[0] === '--version') {
                callback(null, 'uvx 1.0.0', '')
                return
            }
            if (args.includes('install')) {
                callback(null, 'installed', '')
                return
            }
            callback(new Error('missing') as ExecFileException)
        })
        const { getApmSyncTargets, runApmTargetSync } = await import('./target-sync.js')

        try {
            await writeApmPackage(workingDir, 'agent-1', buildApmManifestForAgent({
                id: 'agent-1',
                name: 'Planner',
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                inlineInstruction: 'Plan carefully.',
                danceRefs: [],
                mcpServerNames: [],
            }))

            const targets = await getApmSyncTargets()
            expect(targets.tooling.recommendedCommand).toBe('uvx --from apm-cli apm')
            expect(targets.targets.every((target) => target.available === true)).toBe(true)
            expect(targets.targets[0].commandPreview).toContain('uvx --from apm-cli apm install')

            const response = await runApmTargetSync(workingDir, {
                target: 'codex',
                packageIds: ['agent-1'],
            })

            expect(response.results[0]).toEqual(expect.objectContaining({
                packageId: 'agent-1',
                target: 'codex',
                status: 'synced',
                command: expect.stringContaining('uvx --from apm-cli apm install'),
            }))
            expect(execFileMock).toHaveBeenCalledWith(
                'uvx',
                ['--from', 'apm-cli', 'apm', 'install', path.join(workingDir, '.apm-studio', 'packages', 'agent-1'), '--target', 'codex'],
                expect.objectContaining({ cwd: workingDir }),
                expect.any(Function),
            )
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })

    it('runs apm install for selected package roots and target ids', async () => {
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-target-sync-'))
        execFileMock.mockImplementation((command: string, args: string[], _options: unknown, callback: (error: ExecFileException | null, stdout?: string, stderr?: string) => void) => {
            if (args[0] === '--version') {
                callback(null, `${command} 1.0.0`, '')
                return
            }
            callback(null, 'installed', '')
        })
        const { runApmTargetSync } = await import('./target-sync.js')

        try {
            await writeApmPackage(workingDir, 'agent-1', buildApmManifestForAgent({
                id: 'agent-1',
                name: 'Planner',
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                inlineInstruction: 'Plan carefully.',
                danceRefs: [],
                mcpServerNames: [],
            }))

            const response = await runApmTargetSync(workingDir, {
                targets: ['codex', 'gemini'],
                packageIds: ['agent-1'],
            })

            expect(response.results).toEqual([
                expect.objectContaining({
                    packageId: 'agent-1',
                    target: 'codex',
                    status: 'synced',
                    command: expect.stringContaining('apm install'),
                }),
                expect.objectContaining({
                    packageId: 'agent-1',
                    target: 'gemini',
                    status: 'synced',
                    command: expect.stringContaining('--target gemini'),
                }),
            ])
            expect(response.targets).toEqual(['codex', 'gemini'])
            expect(execFileMock).toHaveBeenCalledWith(
                'apm',
                ['install', path.join(workingDir, '.apm-studio', 'packages', 'agent-1'), '--target', 'codex'],
                expect.objectContaining({ cwd: workingDir }),
                expect.any(Function),
            )
            expect(execFileMock).toHaveBeenCalledWith(
                'apm',
                ['install', path.join(workingDir, '.apm-studio', 'packages', 'agent-1'), '--target', 'gemini'],
                expect.objectContaining({ cwd: workingDir }),
                expect.any(Function),
            )
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })
})
