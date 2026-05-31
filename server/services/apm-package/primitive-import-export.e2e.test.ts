import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ExecFileException } from 'node:child_process'
import type {
    ApmSyncTargetId,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts.js'
import {
    importApmPackagesFromGitHub,
} from './github-import.js'
import { readApmPackage } from './repository.js'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({
    execFile: execFileMock,
}))

type ExecCallback = (error: ExecFileException | null, stdout?: string, stderr?: string) => void

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })
}

function textResponse(body: string) {
    return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
    })
}

function fixtureFetch(files: Record<string, string>) {
    return vi.fn(async (url: string | URL) => {
        const href = url.toString()
        if (href === 'https://api.github.com/repos/acme/primitive-kit') {
            return jsonResponse({ default_branch: 'main' })
        }
        if (href === 'https://api.github.com/repos/acme/primitive-kit/git/trees/main?recursive=1') {
            return jsonResponse({
                tree: Object.keys(files).map((filePath) => ({ type: 'blob', path: filePath })),
            })
        }
        const rawPrefix = 'https://raw.githubusercontent.com/acme/primitive-kit/main/'
        if (href.startsWith(rawPrefix)) {
            const sourcePath = href.slice(rawPrefix.length)
            const body = files[sourcePath]
            return body === undefined ? new Response('not found', { status: 404 }) : textResponse(body)
        }
        return new Response('not found', { status: 404 })
    })
}

function fullPrimitivePackageFiles() {
    return {
        'apm.yml': [
            'name: primitive-kit',
            'version: 0.1.0',
            'description: Every APM primitive in one package',
            'includes: auto',
            'dependencies:',
            '  apm: []',
            '  mcp:',
            '    - name: filesystem',
            '      registry: false',
            '      transport: stdio',
            '      command: npx',
            '      args:',
            '        - -y',
            '        - "@modelcontextprotocol/server-filesystem"',
            '        - .',
            '',
        ].join('\n'),
        '.apm/agents/reviewer.agent.md': [
            '---',
            'name: reviewer',
            'description: Review changes',
            '---',
            '',
            'Review with context.',
        ].join('\n'),
        '.apm/instructions/security.instructions.md': [
            '---',
            'description: Security defaults',
            '---',
            '',
            'Prefer safe defaults.',
        ].join('\n'),
        '.apm/skills/research/SKILL.md': [
            '---',
            'name: research',
            'description: Research skill',
            '---',
            '',
            'Research deeply.',
        ].join('\n'),
        '.apm/skills/research/scripts/check.sh': 'echo research\n',
        '.apm/prompts/release.prompt.md': [
            '---',
            'description: Release notes',
            '---',
            '',
            'Write release notes.',
        ].join('\n'),
        '.apm/hooks/codex-hooks.json': JSON.stringify({ hooks: { Stop: [{ command: 'echo done' }] } }),
    }
}

function standaloneMcpConfigFiles() {
    return {
        '.cursor/mcp.json': JSON.stringify({
            mcpServers: {
                filesystem: {
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
                    env: { SAFE_MODE: '1' },
                },
            },
        }),
    }
}

async function fileExists(filePath: string) {
    const stat = await fs.stat(filePath).catch(() => null)
    return stat?.isFile() === true
}

async function expectTempPackageForTarget(packageRoot: string, target: ApmSyncTargetId) {
    const source = (...segments: string[]) => path.join(packageRoot, '.apm', ...segments)
    const manifest = await fs.readFile(path.join(packageRoot, 'apm.yml'), 'utf-8')
    if (target === 'codex' && await fileExists(source('hooks', 'codex-hooks.json'))) {
        await expect(fs.readFile(source('hooks', 'codex-hooks.json'), 'utf-8')).resolves.toContain('Stop')
        await expect(fs.stat(source('agents'))).rejects.toMatchObject({ code: 'ENOENT' })
        return 'hooks'
    }
    if (target === 'codex') {
        await expect(fs.readFile(source('agents', 'reviewer.agent.md'), 'utf-8')).resolves.toContain('Review with context')
        await expect(fs.stat(source('prompts'))).rejects.toMatchObject({ code: 'ENOENT' })
        return 'agents'
    }
    if (target === 'claude') {
        await expect(fs.readFile(source('instructions', 'security.instructions.md'), 'utf-8')).resolves.toContain('Prefer safe defaults')
        await expect(fs.stat(source('skills'))).rejects.toMatchObject({ code: 'ENOENT' })
        return 'instructions'
    }
    if (target === 'agent-skills') {
        await expect(fs.readFile(source('skills', 'research', 'SKILL.md'), 'utf-8')).resolves.toContain('Research deeply')
        await expect(fs.readFile(source('skills', 'research', 'scripts', 'check.sh'), 'utf-8')).resolves.toContain('research')
        await expect(fs.stat(source('agents'))).rejects.toMatchObject({ code: 'ENOENT' })
        return 'skills'
    }
    if (target === 'copilot') {
        await expect(fs.readFile(source('prompts', 'release.prompt.md'), 'utf-8')).resolves.toContain('Write release notes')
        await expect(fs.stat(source('hooks'))).rejects.toMatchObject({ code: 'ENOENT' })
        return 'prompts'
    }
    if (target === 'opencode') {
        await expect(fs.readFile(source('prompts', 'release.prompt.md'), 'utf-8')).resolves.toContain('Write release notes')
        await expect(fs.stat(source('skills'))).rejects.toMatchObject({ code: 'ENOENT' })
        return 'commands'
    }
    if (target === 'cursor') {
        expect(manifest).toContain('name: filesystem')
        expect(manifest).toContain('registry: false')
        expect(manifest).toContain('command: npx')
        await expect(fs.stat(source('agents'))).rejects.toMatchObject({ code: 'ENOENT' })
        return 'mcp'
    }
    throw new Error(`Unexpected fixture target: ${target}`)
}

async function writeFixtureArtifact(cwd: string, target: ApmSyncTargetId, syncUnit: ApmSyncUnit) {
    const artifactByUnit: Partial<Record<ApmSyncUnit, { path: string; body: string }>> = {
        agents: {
            path: '.codex/agents/reviewer.toml',
            body: 'name = "reviewer"\ndeveloper_instructions = "Review with context."\n',
        },
        instructions: {
            path: '.claude/rules/security.md',
            body: 'Prefer safe defaults.\n',
        },
        skills: {
            path: '.agents/skills/research/SKILL.md',
            body: '# Research\nResearch deeply.\n',
        },
        prompts: {
            path: '.github/prompts/release.prompt.md',
            body: 'Write release notes.\n',
        },
        commands: {
            path: '.opencode/commands/release.md',
            body: 'Write release notes.\n',
        },
        hooks: {
            path: '.codex/hooks.json',
            body: JSON.stringify({ hooks: { Stop: [{ command: 'echo done' }] } }),
        },
        mcp: {
            path: '.cursor/mcp.json',
            body: JSON.stringify({ mcpServers: { filesystem: { command: 'npx' } } }),
        },
    }
    const artifact = artifactByUnit[syncUnit]
    if (!artifact) throw new Error(`No fixture artifact for ${target}/${syncUnit}`)
    const targetPath = path.join(cwd, artifact.path)
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, artifact.body, 'utf-8')
    return artifact.path
}

function mockApmCli() {
    execFileMock.mockImplementation((command: string, args: string[], options: { cwd?: string }, callback: ExecCallback) => {
        if (command !== 'apm-fixture') {
            callback(new Error(`Unexpected command: ${command}`) as ExecFileException)
            return
        }
        if (args.includes('--version')) {
            callback(null, 'apm-fixture 1.0.0', '')
            return
        }
        const installIndex = args.indexOf('install')
        const targetIndex = args.indexOf('--target')
        if (installIndex < 0 || targetIndex < 0 || !options.cwd) {
            callback(new Error(`Unexpected APM fixture args: ${args.join(' ')}`) as ExecFileException)
            return
        }
        const packageRoot = args[installIndex + 1]
        const target = args[targetIndex + 1] as ApmSyncTargetId
        void expectTempPackageForTarget(packageRoot, target)
            .then((syncUnit) => writeFixtureArtifact(options.cwd || '', target, syncUnit as ApmSyncUnit))
            .then((artifact) => callback(null, `wrote ${artifact}`, ''))
            .catch((error) => callback(error as ExecFileException))
    })
}

describe('primitive import to export e2e', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-primitive-e2e-'))
        vi.stubEnv('APM_STUDIO_APM_CLI', 'apm-fixture')
        mockApmCli()
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
        execFileMock.mockReset()
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    it('imports a full APM package and exports every primitive sync unit', async () => {
        vi.stubGlobal('fetch', fixtureFetch(fullPrimitivePackageFiles()))
        const { runApmTargetSync, getApmSyncTargets } = await import('./target-sync.js')

        const importResult = await importApmPackagesFromGitHub(workingDir, {
            source: 'acme/primitive-kit',
            format: 'apm',
            limit: 1,
        })
        const packageId = importResult.packages[0].packageId
        const pkg = await readApmPackage(workingDir, packageId)

        expect(pkg?.microsoftApm?.primitiveCounts).toEqual({
            agents: 1,
            instructions: 1,
            skills: 1,
            prompts: 1,
            commands: 1,
            hooks: 1,
            mcp: 1,
        })
        expect(pkg?.microsoftApm?.primitivePaths).toEqual(expect.arrayContaining([
            '.apm/agents/reviewer.agent.md',
            '.apm/instructions/security.instructions.md',
            '.apm/skills/research/SKILL.md',
            '.apm/skills/research/scripts/check.sh',
            '.apm/prompts/release.prompt.md',
            '.apm/hooks/codex-hooks.json',
        ]))

        const matrix: Array<{ syncUnit: ApmSyncUnit; target: ApmSyncTargetId; artifact: string; snippet: string }> = [
            { syncUnit: 'agents', target: 'codex', artifact: '.codex/agents/reviewer.toml', snippet: 'Review with context' },
            { syncUnit: 'instructions', target: 'claude', artifact: '.claude/rules/security.md', snippet: 'Prefer safe defaults' },
            { syncUnit: 'skills', target: 'agent-skills', artifact: '.agents/skills/research/SKILL.md', snippet: 'Research deeply' },
            { syncUnit: 'prompts', target: 'copilot', artifact: '.github/prompts/release.prompt.md', snippet: 'Write release notes' },
            { syncUnit: 'commands', target: 'opencode', artifact: '.opencode/commands/release.md', snippet: 'Write release notes' },
            { syncUnit: 'hooks', target: 'codex', artifact: '.codex/hooks.json', snippet: 'Stop' },
            { syncUnit: 'mcp', target: 'cursor', artifact: '.cursor/mcp.json', snippet: 'filesystem' },
        ]

        for (const entry of matrix) {
            const response = await runApmTargetSync(workingDir, {
                targets: [entry.target],
                syncUnit: entry.syncUnit,
                packageIds: [packageId],
            })
            expect(response.results).toEqual([
                expect.objectContaining({
                    packageId,
                    target: entry.target,
                    syncUnit: entry.syncUnit,
                    status: 'synced',
                    artifacts: [entry.artifact],
                    command: expect.stringContaining(`apm-fixture install`),
                }),
            ])
            await expect(fs.readFile(path.join(workingDir, entry.artifact), 'utf-8'))
                .resolves.toContain(entry.snippet)
        }

        const ownership = JSON.parse(await fs.readFile(path.join(workingDir, '.apm-studio', 'projections', 'apm-sync.json'), 'utf-8'))
        for (const entry of matrix) {
            expect(ownership.files[entry.artifact]).toEqual(expect.objectContaining({
                packageId,
                target: entry.target,
                syncUnit: entry.syncUnit,
                source: 'apm-cli',
            }))
        }

        const targets = await getApmSyncTargets(workingDir)
        const allDefinitions = targets.targets.flatMap((target) => target.definitions)
        expect(allDefinitions).toEqual(expect.arrayContaining(matrix.map((entry) => expect.objectContaining({
            path: entry.artifact,
            syncUnit: entry.syncUnit,
            managed: true,
            managedPackageId: packageId,
        }))))
    })

    it('imports standalone MCP configs with self-defined server details before export', async () => {
        vi.stubGlobal('fetch', fixtureFetch(standaloneMcpConfigFiles()))
        const { runApmTargetSync } = await import('./target-sync.js')

        const importResult = await importApmPackagesFromGitHub(workingDir, {
            source: 'acme/primitive-kit',
            format: 'mcp-config',
            limit: 1,
        })
        const packageId = importResult.packages[0].packageId
        const pkg = await readApmPackage(workingDir, packageId)

        expect(pkg?.manifest.dependencies?.mcp).toEqual([
            expect.objectContaining({
                name: 'filesystem',
                registry: false,
                transport: 'stdio',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
                env: { SAFE_MODE: '1' },
            }),
        ])
        expect(pkg?.microsoftApm?.primitiveCounts.mcp).toBe(1)

        const response = await runApmTargetSync(workingDir, {
            targets: ['cursor'],
            syncUnit: 'mcp',
            packageIds: [packageId],
        })

        expect(response.results[0]).toEqual(expect.objectContaining({
            packageId,
            target: 'cursor',
            syncUnit: 'mcp',
            status: 'synced',
            artifacts: ['.cursor/mcp.json'],
        }))
        await expect(fs.readFile(path.join(workingDir, '.cursor', 'mcp.json'), 'utf-8'))
            .resolves.toContain('filesystem')
    })
})
