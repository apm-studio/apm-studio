import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ExecFileException } from 'node:child_process'
import type {
    ApmSyncTargetId,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts.js'
import type {
    WorkspaceAgentSnapshot,
} from '../../../shared/workspace-contracts.js'
import {
    importApmPackagesFromGitHub,
} from './github-import.js'
import { clearGithubSourceCaches } from './github-source.js'
import { readManifestFile } from './package-files.js'
import { readApmPackage } from './repository.js'
import { writeApmPackagesForWorkspace } from './workspace.js'

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

async function firstFileWithSuffix(dir: string, suffix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const match = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
        .map((entry) => path.join(dir, entry.name))
        .sort((left, right) => left.localeCompare(right))[0]
    return match || null
}

function parsePrimitiveMarkdown(raw: string) {
    const normalized = raw.replace(/\r\n/g, '\n').trim()
    if (!normalized.startsWith('---\n')) {
        return { data: {}, body: normalized }
    }
    const lines = normalized.split('\n')
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end < 0) {
        return { data: {}, body: normalized }
    }
    const data: Record<string, string> = {}
    for (const line of lines.slice(1, end)) {
        const match = line.match(/^([^:#]+):\s*(.*)$/)
        if (!match) continue
        data[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    }
    return {
        data,
        body: lines.slice(end + 1).join('\n').trim(),
    }
}

function tomlString(value: string) {
    return JSON.stringify(value)
}

function mcpDependencyNames(dependencies: unknown) {
    if (!Array.isArray(dependencies)) return []
    return dependencies
        .map((entry) => {
            if (typeof entry === 'string') return entry
            if (entry && typeof entry === 'object' && 'name' in entry) {
                const name = (entry as { name?: unknown }).name
                return typeof name === 'string' ? name : null
            }
            return null
        })
        .filter((entry): entry is string => !!entry)
}

async function mcpServerNamesFromTempPackage(packageRoot: string) {
    const manifest = await readManifestFile(path.join(packageRoot, 'apm.yml'))
    return mcpDependencyNames(manifest?.dependencies?.mcp)
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
        const agentFile = await firstFileWithSuffix(source('agents'), '.agent.md')
        if (agentFile) {
            await expect(fs.readFile(agentFile, 'utf-8')).resolves.toContain('---')
            await expect(fs.stat(source('prompts'))).rejects.toMatchObject({ code: 'ENOENT' })
            return 'agents'
        }

        const mcpServerNames = await mcpServerNamesFromTempPackage(packageRoot)
        if (mcpServerNames.length > 0) {
            expect(manifest).toContain(`name: ${mcpServerNames[0]}`)
            await expect(fs.stat(source('agents'))).rejects.toMatchObject({ code: 'ENOENT' })
            return 'mcp'
        }
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

async function writeCodexAgentFixtureArtifact(cwd: string, packageRoot: string) {
    const agentFile = await firstFileWithSuffix(path.join(packageRoot, '.apm', 'agents'), '.agent.md')
    if (!agentFile) throw new Error('No APM agent primitive found for Codex fixture output.')
    const slug = path.basename(agentFile).replace(/\.agent\.md$/, '')
    const parsed = parsePrimitiveMarkdown(await fs.readFile(agentFile, 'utf-8'))
    const targetPath = path.join(cwd, '.codex', 'agents', `${slug}.toml`)
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, [
        `name = ${tomlString(parsed.data.name || slug)}`,
        ...(parsed.data.description ? [`description = ${tomlString(parsed.data.description)}`] : []),
        `developer_instructions = ${tomlString(parsed.body)}`,
        '',
    ].join('\n'), 'utf-8')
    return `.codex/agents/${slug}.toml`
}

async function writeMcpFixtureArtifact(cwd: string, target: ApmSyncTargetId, packageRoot: string) {
    const serverName = (await mcpServerNamesFromTempPackage(packageRoot))[0] || 'filesystem'
    if (target === 'codex') {
        const targetPath = path.join(cwd, '.codex', 'config.toml')
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.writeFile(targetPath, [
            `[mcp_servers.${serverName}]`,
            'command = "npx"',
            `args = ["-y", "${serverName === 'playwright' ? '@playwright/mcp@latest' : serverName}"]`,
            '',
        ].join('\n'), 'utf-8')
        return '.codex/config.toml'
    }

    const targetPath = path.join(cwd, '.cursor', 'mcp.json')
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, JSON.stringify({
        mcpServers: {
            [serverName]: { command: 'npx' },
        },
    }), 'utf-8')
    return '.cursor/mcp.json'
}

async function writeFixtureArtifact(
    cwd: string,
    target: ApmSyncTargetId,
    syncUnit: ApmSyncUnit,
    packageRoot: string,
) {
    if (target === 'codex' && syncUnit === 'agents') {
        return writeCodexAgentFixtureArtifact(cwd, packageRoot)
    }
    if (syncUnit === 'mcp') {
        return writeMcpFixtureArtifact(cwd, target, packageRoot)
    }

    const artifactByUnit: Partial<Record<ApmSyncUnit, { path: string; body: string }>> = {
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
            .then((syncUnit) => writeFixtureArtifact(options.cwd || '', target, syncUnit as ApmSyncUnit, packageRoot))
            .then((artifact) => callback(null, `wrote ${artifact}`, ''))
            .catch((error) => callback(error as ExecFileException))
    })
}

describe('primitive import to export e2e', () => {
    let workingDir: string

    beforeEach(async () => {
        clearGithubSourceCaches()
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-primitive-e2e-'))
        vi.stubEnv('APM_STUDIO_APM_CLI', 'apm-fixture')
        mockApmCli()
    })

    afterEach(async () => {
        clearGithubSourceCaches()
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

    it('saves a Studio Agent and exports Codex agent plus Playwright MCP', async () => {
        const { runApmTargetSync, getApmSyncTargets } = await import('./target-sync.js')
        const packageId = 'studio-browser-agent'
        const agentBody = [
            'Use Playwright MCP to inspect browser-facing behavior before making recommendations.',
            'Report only what you verified and call out unknowns clearly.',
        ].join('\n')
        const agent: WorkspaceAgentSnapshot = {
            id: packageId,
            name: 'Browser Researcher',
            position: { x: 120, y: 80 },
            width: 360,
            height: 260,
            model: {
                provider: 'openai',
                modelId: 'gpt-5.4',
                temperature: 0.2,
            },
            modelVariant: 'reasoning-high',
            agentBody,
            skillRefs: [],
            mcpServerNames: ['playwright'],
            declaredMcpConfig: {
                mcpServers: {
                    playwright: {
                        command: 'npx',
                        args: ['-y', '@playwright/mcp@latest'],
                    },
                },
            },
            runtimeAgentId: 'runtime-browser-researcher',
            planMode: true,
            meta: {
                authoring: {
                    description: 'Researches browser behavior with Playwright.',
                },
            },
        }

        await expect(writeApmPackagesForWorkspace(workingDir, {
            workingDir,
            agents: [agent],
        })).resolves.toEqual({ packageIds: [packageId] })

        const pkg = await readApmPackage(workingDir, packageId)
        expect(pkg?.manifest.dependencies?.mcp).toEqual([{ name: 'playwright' }])
        expect(pkg?.manifest['x-apm']?.agent).toEqual(expect.objectContaining({
            agentName: 'Browser Researcher',
            agentBody,
            mcpServerNames: ['playwright'],
            model: expect.objectContaining({
                modelId: 'gpt-5.4',
            }),
            modelVariant: 'reasoning-high',
            runtimeAgentId: 'runtime-browser-researcher',
            planMode: true,
        }))
        expect(pkg?.microsoftApm?.primitiveCounts).toEqual(expect.objectContaining({
            agents: 1,
            mcp: 1,
        }))
        await expect(fs.readFile(
            path.join(workingDir, 'packages', packageId, '.apm', 'agents', 'browser-researcher.agent.md'),
            'utf-8',
        )).resolves.toContain(agentBody)

        const agentExport = await runApmTargetSync(workingDir, {
            targets: ['codex'],
            syncUnit: 'agents',
            packageIds: [packageId],
        })
        expect(agentExport.results).toEqual([
            expect.objectContaining({
                packageId,
                target: 'codex',
                syncUnit: 'agents',
                status: 'synced',
                artifacts: ['.codex/agents/browser-researcher.toml'],
                modelOmitted: true,
            }),
        ])
        const codexAgent = await fs.readFile(path.join(workingDir, '.codex', 'agents', 'browser-researcher.toml'), 'utf-8')
        expect(codexAgent).toContain('developer_instructions')
        expect(codexAgent).toContain('Use Playwright MCP')
        expect(codexAgent).not.toContain('gpt-5.4')
        expect(codexAgent).not.toContain('model')
        expect(codexAgent).not.toContain('runtime-browser-researcher')

        const mcpExport = await runApmTargetSync(workingDir, {
            targets: ['codex'],
            syncUnit: 'mcp',
            packageIds: [packageId],
        })
        expect(mcpExport.results).toEqual([
            expect.objectContaining({
                packageId,
                target: 'codex',
                syncUnit: 'mcp',
                status: 'synced',
                artifacts: ['.codex/config.toml'],
            }),
        ])
        const codexMcp = await fs.readFile(path.join(workingDir, '.codex', 'config.toml'), 'utf-8')
        expect(codexMcp).toContain('[mcp_servers.playwright]')
        expect(codexMcp).toContain('@playwright/mcp@latest')

        const ownership = JSON.parse(await fs.readFile(path.join(workingDir, '.apm-studio', 'projections', 'apm-sync.json'), 'utf-8'))
        expect(ownership.files['.codex/agents/browser-researcher.toml']).toEqual(expect.objectContaining({
            packageId,
            target: 'codex',
            syncUnit: 'agents',
            source: 'apm-cli',
        }))
        expect(ownership.files['.codex/config.toml']).toEqual(expect.objectContaining({
            packageId,
            target: 'codex',
            syncUnit: 'mcp',
            source: 'apm-cli',
        }))

        const targets = await getApmSyncTargets(workingDir)
        const codexDefinitions = targets.targets.find((target) => target.id === 'codex')?.definitions || []
        expect(codexDefinitions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                path: '.codex/agents/browser-researcher.toml',
                kind: 'agent',
                managed: true,
                managedPackageId: packageId,
                managedSyncUnit: 'agents',
            }),
            expect.objectContaining({
                path: '.codex/config.toml',
                kind: 'mcp',
                managed: true,
                managedPackageId: packageId,
                managedSyncUnit: 'mcp',
            }),
        ]))
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
