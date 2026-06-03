import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { importApmPackagesFromGitHub, listApmGitHubSourceItems, previewApmPackagesFromGitHub } from './github-import.js'
import { readApmPackage } from './repository.js'
import { clearGithubSourceCaches } from './github-source.js'

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })
}

function tarEntry(name: string, body = '') {
    const content = Buffer.from(body)
    const header = Buffer.alloc(512)
    header.write(name, 0, 100, 'utf-8')
    header.write('0000644\0', 100, 8, 'ascii')
    header.write('0000000\0', 108, 8, 'ascii')
    header.write('0000000\0', 116, 8, 'ascii')
    header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
    header.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii')
    header.fill(' ', 148, 156)
    header.write('0', 156, 1, 'ascii')
    header.write('ustar\0', 257, 6, 'ascii')
    header.write('00', 263, 2, 'ascii')

    let checksum = 0
    for (const byte of header) checksum += byte
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')

    const paddingSize = Math.ceil(content.length / 512) * 512 - content.length
    return Buffer.concat([header, content, Buffer.alloc(paddingSize)])
}

function tarballResponse(paths: string[]) {
    const body = Buffer.concat([
        ...paths.map((name) => tarEntry(name)),
        Buffer.alloc(1024),
    ])
    return new Response(gzipSync(body), {
        headers: {
            'content-length': String(body.length),
            'content-type': 'application/x-gzip',
        },
    })
}

describe('APM GitHub source import', () => {
    let workingDir: string

    beforeEach(async () => {
        clearGithubSourceCaches()
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-github-'))
    })

    afterEach(async () => {
        clearGithubSourceCaches()
        vi.restoreAllMocks()
        vi.unstubAllEnvs()
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    it('imports Claude agent markdown as APM-first agent packages', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'README.md' },
                        { type: 'blob', path: 'categories/04-quality-security/README.md' },
                        { type: 'blob', path: 'categories/04-quality-security/code-reviewer.md' },
                        { type: 'blob', path: 'categories/04-quality-security/debugger.md' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories/04-quality-security/code-reviewer.md') {
                return new Response([
                    '---',
                    'name: code-reviewer',
                    'description: "Use this agent for careful code review."',
                    'tools: Read, Grep, Bash',
                    'model: opus',
                    '---',
                    '',
                    'You are a senior code reviewer. Review for bugs first.',
                ].join('\n'))
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await importApmPackagesFromGitHub(workingDir, {
            source: 'VoltAgent/awesome-claude-code-subagents/categories/04-quality-security',
            format: 'claude-md',
            limit: 1,
        })

        expect(result.packages).toEqual([
            expect.objectContaining({
                name: 'code-reviewer',
                kind: 'agent',
                sourcePath: 'categories/04-quality-security/code-reviewer.md',
            }),
        ])
        expect(result.warnings).toEqual([
            'Imported the first 1 packages. Narrow the source path or raise the limit to import more.',
        ])

        const pkg = await readApmPackage(workingDir, result.packages[0].packageId)
        expect(pkg?.manifest['x-apm']?.agent?.derivedFrom).toBe(
            'github:VoltAgent/awesome-claude-code-subagents:main:categories/04-quality-security/code-reviewer.md',
        )
        expect(pkg?.manifest['x-apm']?.agent?.agentBody).toContain('Review for bugs first.')
        expect(pkg?.manifest.agents?.[0]).toMatchObject({
            name: 'code-reviewer',
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            source: {
                adapter: 'claude-md',
                sourceModel: 'opus',
                tools: ['Read', 'Grep', 'Bash'],
            },
        })
        expect(pkg?.microsoftApm?.primitiveCounts).toEqual({
            agents: 1,
            instructions: 0,
            skills: 0,
            prompts: 0,
            commands: 0,
            hooks: 0,
        })
    })

    it('can import GitHub packages into the user-scope APM workspace', async () => {
        const userDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-user-'))
        vi.stubEnv('APM_STUDIO_USER_APM_HOME', userDir)
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'categories/04-quality-security/code-reviewer.md' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories/04-quality-security/code-reviewer.md') {
                return new Response([
                    '---',
                    'name: code-reviewer',
                    'description: "Use this agent for careful code review."',
                    '---',
                    '',
                    'Review for bugs first.',
                ].join('\n'))
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await importApmPackagesFromGitHub(workingDir, {
            source: 'VoltAgent/awesome-claude-code-subagents/categories/04-quality-security',
            format: 'claude-md',
            limit: 1,
            scope: 'user',
        })

        expect(result.scope).toBe('user')
        expect(result.targetWorkingDir).toBe(userDir)
        expect(await readApmPackage(userDir, result.packages[0].packageId)).not.toBeNull()
        expect(await readApmPackage(workingDir, result.packages[0].packageId)).toBeNull()

        await fs.rm(userDir, { recursive: true, force: true }).catch(() => {})
    })

    it('converts Claude settings hooks into APM hook packages', async () => {
        const claudeSettings = JSON.stringify({
            permissions: { allow: ['Bash(uv:*)'] },
            hooks: {
                PreToolUse: [{
                    matcher: '',
                    hooks: [{
                        type: 'command',
                        command: 'uv run $CLAUDE_PROJECT_DIR/.claude/hooks/pre_tool_use.py',
                    }],
                }],
                UserPromptSubmit: [{
                    hooks: [{
                        type: 'command',
                        command: 'uv run ${CLAUDE_PROJECT_DIR}/.claude/hooks/user_prompt_submit.py --log-only',
                    }],
                }],
            },
        })
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/disler/claude-code-hooks-mastery') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/disler/claude-code-hooks-mastery/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'README.md' },
                        { type: 'blob', path: '.claude/settings.json' },
                        { type: 'blob', path: '.claude/hooks/pre_tool_use.py' },
                        { type: 'blob', path: '.claude/hooks/user_prompt_submit.py' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/disler/claude-code-hooks-mastery/main/.claude/settings.json') {
                return new Response(claudeSettings)
            }
            if (href === 'https://raw.githubusercontent.com/disler/claude-code-hooks-mastery/main/.claude/hooks/pre_tool_use.py') {
                return new Response('print("pre tool")\n')
            }
            if (href === 'https://raw.githubusercontent.com/disler/claude-code-hooks-mastery/main/.claude/hooks/user_prompt_submit.py') {
                return new Response('print("prompt")\n')
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const preview = await previewApmPackagesFromGitHub({
            source: 'disler/claude-code-hooks-mastery',
            format: 'auto',
            limit: 10,
        })

        expect(preview.candidates[0]).toMatchObject({
            name: 'claude-code-hooks-mastery-claude-hooks',
            kind: 'package',
            format: 'claude-settings',
            sourcePath: '.claude/settings.json',
            targets: ['Claude'],
            primitiveCounts: { hooks: 1 },
        })

        const result = await importApmPackagesFromGitHub(workingDir, {
            source: 'disler/claude-code-hooks-mastery',
            candidateIds: [preview.candidates[0].id],
            format: 'auto',
            limit: 10,
        })
        const pkg = await readApmPackage(workingDir, result.packages[0].packageId)
        const packageRoot = path.join(workingDir, result.packages[0].packagePath)
        const hooksJson = JSON.parse(await fs.readFile(path.join(packageRoot, '.apm/hooks/claude-hooks.json'), 'utf-8'))

        expect(result.packages[0]).toMatchObject({
            name: 'claude-code-hooks-mastery-claude-hooks',
            kind: 'package',
            sourcePath: '.claude/settings.json',
        })
        expect(pkg?.manifest).toMatchObject({
            type: 'hybrid',
            target: ['claude'],
            'x-apm': { kind: 'hook' },
        })
        expect(pkg?.microsoftApm?.primitiveCounts.hooks).toBe(1)
        expect(hooksJson.permissions).toBeUndefined()
        expect(hooksJson.hooks.PreToolUse[0].hooks[0].command).toBe(
            'uv run ${PLUGIN_ROOT}/.apm/hooks/scripts/claude/pre_tool_use.py',
        )
        expect(hooksJson.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
            'uv run ${PLUGIN_ROOT}/.apm/hooks/scripts/claude/user_prompt_submit.py --log-only',
        )
        await expect(fs.readFile(path.join(packageRoot, '.apm/hooks/scripts/claude/pre_tool_use.py'), 'utf-8'))
            .resolves.toContain('pre tool')
    })

    it('converts target-native artifacts into APM source packages', async () => {
        const rawPrefix = 'https://raw.githubusercontent.com/acme/target-kit/main/'
        const files: Record<string, string> = {
            '.codex/hooks.json': JSON.stringify({
                hooks: {
                    Stop: [{
                        hooks: [{
                            type: 'command',
                            command: 'bash .codex/hooks/notify.sh',
                        }],
                    }],
                },
            }),
            '.codex/hooks/notify.sh': 'echo done\n',
            'nested/.claude/commands/release.md': '---\ndescription: Release checklist\n---\n\nShip the release.',
            '.cursor/rules/security.mdc': '# Security\n\nPrefer secure defaults.',
            '.github/copilot-instructions.md': 'Use repository standards.',
            '.vscode/mcp.json': JSON.stringify({
                servers: {
                    filesystem: {
                        command: ['npx', '-y', '@modelcontextprotocol/server-filesystem', '.'],
                    },
                },
            }),
        }
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/acme/target-kit') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/acme/target-kit/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: '.codex/hooks.json' },
                        { type: 'blob', path: '.codex/hooks/notify.sh' },
                        { type: 'blob', path: 'nested/.claude/commands/release.md' },
                        { type: 'blob', path: '.cursor/rules/security.mdc' },
                        { type: 'blob', path: '.github/copilot-instructions.md' },
                        { type: 'blob', path: '.vscode/mcp.json' },
                    ],
                })
            }
            const sourcePath = href.startsWith(rawPrefix) ? href.slice(rawPrefix.length) : ''
            if (sourcePath in files) return new Response(files[sourcePath])
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const preview = await previewApmPackagesFromGitHub({
            source: 'acme/target-kit',
            format: 'auto',
            limit: 10,
        })

        expect(preview.candidates.map((candidate) => candidate.sourcePath)).toEqual([
            '.codex/hooks.json',
            'nested/.claude/commands/release.md',
            '.cursor/rules/security.mdc',
            '.github/copilot-instructions.md',
            '.vscode/mcp.json',
        ])
        expect(preview.candidates.map((candidate) => candidate.format)).toEqual([
            'target-native',
            'target-native',
            'target-native',
            'target-native',
            'mcp-config',
        ])
        expect(preview.candidates[0]).toMatchObject({
            targets: ['Codex'],
            primitiveCounts: { hooks: 1 },
        })

        const result = await importApmPackagesFromGitHub(workingDir, {
            source: 'acme/target-kit',
            candidateIds: preview.candidates.map((candidate) => candidate.id),
            format: 'auto',
            limit: 10,
        })
        const packageBySource = new Map(result.packages.map((pkg) => [pkg.sourcePath, pkg]))

        const hookPackage = packageBySource.get('.codex/hooks.json')
        expect(hookPackage).toBeDefined()
        const hookRoot = path.join(workingDir, hookPackage?.packagePath || '')
        const hookJson = JSON.parse(await fs.readFile(path.join(hookRoot, '.apm/hooks/codex-hooks.json'), 'utf-8'))
        expect(hookJson.hooks.Stop[0].hooks[0].command).toBe('bash ./scripts/codex/notify.sh')
        await expect(fs.readFile(path.join(hookRoot, '.apm/hooks/scripts/codex/notify.sh'), 'utf-8'))
            .resolves.toContain('echo done')

        const commandPackage = packageBySource.get('nested/.claude/commands/release.md')
        expect(commandPackage).toBeDefined()
        await expect(fs.readFile(path.join(workingDir, commandPackage?.packagePath || '', '.apm/prompts/release.prompt.md'), 'utf-8'))
            .resolves.toContain('Ship the release.')

        const cursorRulePackage = packageBySource.get('.cursor/rules/security.mdc')
        expect(cursorRulePackage).toBeDefined()
        await expect(fs.readFile(path.join(workingDir, cursorRulePackage?.packagePath || '', '.apm/instructions/security.instructions.md'), 'utf-8'))
            .resolves.toContain('Prefer secure defaults.')

        const copilotInstructionPackage = packageBySource.get('.github/copilot-instructions.md')
        expect(copilotInstructionPackage).toBeDefined()
        await expect(fs.readFile(path.join(workingDir, copilotInstructionPackage?.packagePath || '', '.apm/instructions/copilot-instructions.instructions.md'), 'utf-8'))
            .resolves.toContain('Use repository standards.')

        const mcpPackage = packageBySource.get('.vscode/mcp.json')
        expect(mcpPackage).toBeDefined()
        const mcpManifest = (await readApmPackage(workingDir, mcpPackage?.packageId || ''))?.manifest
        expect(mcpManifest?.dependencies?.mcp).toEqual([
            expect.objectContaining({
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
            }),
        ])
        expect(fetchMock.mock.calls.filter(([url]) =>
            url.toString() === 'https://api.github.com/repos/acme/target-kit/git/trees/main?recursive=1',
        )).toHaveLength(1)
        expect(fetchMock.mock.calls.filter(([url]) =>
            url.toString() === 'https://raw.githubusercontent.com/acme/target-kit/main/.codex/hooks.json',
        )).toHaveLength(1)
        expect(fetchMock.mock.calls.filter(([url]) =>
            url.toString() === 'https://raw.githubusercontent.com/acme/target-kit/main/nested/.claude/commands/release.md',
        )).toHaveLength(1)
    })

    it('lists source primitives converted from supported GitHub preset repos', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'README.md' },
                        { type: 'blob', path: 'categories/04-quality-security/code-reviewer.md' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories/04-quality-security/code-reviewer.md') {
                return new Response([
                    '---',
                    'name: code-reviewer',
                    'description: "Use this agent for careful code review."',
                    'tools: Read, Grep, Bash',
                    'model: opus',
                    '---',
                    '',
                    'You are a senior code reviewer.',
                ].join('\n'))
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-codex-subagents') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-codex-subagents/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'README.md' },
                        { type: 'blob', path: 'categories/01-core-development/backend-developer.toml' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/VoltAgent/awesome-codex-subagents/main/categories/01-core-development/backend-developer.toml') {
                return new Response([
                    'name = "backend-developer"',
                    'description = "Use when a task needs scoped backend implementation."',
                    'model = "gpt-5.4"',
                    'model_reasoning_effort = "high"',
                    'developer_instructions = """',
                    'Own backend changes as production behavior.',
                    '"""',
                ].join('\n'))
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await listApmGitHubSourceItems({
            sources: ['awesome-claude-code-subagents', 'awesome-codex-subagents'],
            limitPerSource: 2,
        })

        expect(result.sources.map((source) => source.id).sort()).toEqual([
            'awesome-claude-code-subagents',
            'awesome-codex-subagents',
        ])
        expect(result.primitives).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'agent',
                name: 'code-reviewer',
                importRequest: {
                    source: 'VoltAgent/awesome-claude-code-subagents/categories/04-quality-security/code-reviewer.md',
                    format: 'claude-md',
                    limit: 1,
                },
                sourceName: 'Claude Subagents',
            }),
            expect.objectContaining({
                kind: 'agent',
                name: 'backend-developer',
                importRequest: {
                    source: 'VoltAgent/awesome-codex-subagents/categories/01-core-development/backend-developer.toml',
                    format: 'codex-toml',
                    limit: 1,
                },
                sourceName: 'Codex Subagents',
            }),
        ]))
        expect(result.primitives).toHaveLength(2)
    })

    it('previews mixed APM, Skill, instruction, and MCP repo candidates without writing packages', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/acme/agent-kit') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/acme/agent-kit/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'apm.yml' },
                        { type: 'blob', path: '.apm/agents/reviewer.agent.md' },
                        { type: 'blob', path: '.apm/prompts/release.prompt.md' },
                        { type: 'blob', path: '.apm/hooks/codex-hooks.json' },
                        { type: 'blob', path: 'skills/research/SKILL.md' },
                        { type: 'blob', path: 'instructions/security.md' },
                        { type: 'blob', path: 'prompts/release.prompt.md' },
                        { type: 'blob', path: '.cursor/mcp.json' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/apm.yml') {
                return new Response('name: agent-kit\nversion: 0.1.0\ndescription: APM kit\ntarget: [codex]\n')
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/skills/research/SKILL.md') {
                return new Response('---\nname: research\ndescription: Research skill\n---\n\nResearch deeply.')
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/instructions/security.md') {
                return new Response('---\ndescription: Secure defaults\n---\n\nPrefer secure defaults.')
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/prompts/release.prompt.md') {
                return new Response('---\ndescription: Release note prompt\n---\n\nWrite release notes.')
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/.cursor/mcp.json') {
                return new Response(JSON.stringify({ mcpServers: { filesystem: { command: 'npx' } } }))
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await previewApmPackagesFromGitHub({
            source: 'acme/agent-kit',
            format: 'auto',
            limit: 10,
        })

        expect(result.candidates.map((candidate) => candidate.format)).toEqual([
            'apm',
            'skill-md',
            'instruction-md',
            'mcp-config',
        ])
        expect(result.candidates[0]).toMatchObject({
            kind: 'package',
            name: 'agent-kit',
            primitiveCounts: {
                agents: 1,
                instructions: 0,
                skills: 0,
                prompts: 1,
                commands: 1,
                hooks: 1,
            },
        })
        expect(result.candidates.map((candidate) => candidate.sourcePath)).not.toContain('prompts/release.prompt.md')
        expect(await readApmPackage(workingDir, result.candidates[0].packageId)).toBeNull()
    })

    it('previews only the selected candidate for GitHub blob URLs', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/acme/agent-kit') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/acme/agent-kit/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'skills/research/SKILL.md' },
                        { type: 'blob', path: 'skills/review/SKILL.md' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/skills/research/SKILL.md') {
                return new Response('---\nname: research\ndescription: Research skill\n---\n\nResearch deeply.')
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/skills/review/SKILL.md') {
                throw new Error('The preview should not fetch unrelated skill files.')
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await previewApmPackagesFromGitHub({
            source: 'https://github.com/acme/agent-kit/blob/main/skills/research/SKILL.md',
            format: 'auto',
            limit: 10,
        })

        expect(result.source).toMatchObject({
            repo: 'acme/agent-kit',
            ref: 'main',
            subpath: 'skills/research/SKILL.md',
        })
        expect(result.candidates).toEqual([
            expect.objectContaining({
                kind: 'skill',
                name: 'research',
                sourcePath: 'skills/research/SKILL.md',
            }),
        ])
    })

    it('imports explicitly selected Markdown files as Skill packages', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/acme/agent-kit') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/acme/agent-kit/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'docs/research-guide.md' },
                        { type: 'blob', path: 'docs/other.md' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/docs/research-guide.md') {
                return new Response('---\ndescription: Research workflow\n---\n\nRun a careful research pass.')
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/docs/other.md') {
                throw new Error('The explicit file import should not fetch sibling Markdown files.')
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await importApmPackagesFromGitHub(workingDir, {
            source: 'https://github.com/acme/agent-kit/blob/main/docs/research-guide.md',
            format: 'skill-md',
            limit: 10,
        })

        expect(result.packages).toEqual([
            expect.objectContaining({
                name: 'research-guide',
                kind: 'skill',
                sourcePath: 'docs/research-guide.md',
            }),
        ])
        await expect(fs.readFile(
            path.join(workingDir, result.packages[0].packagePath, '.apm/skills/research-guide/SKILL.md'),
            'utf-8',
        )).resolves.toContain('Run a careful research pass.')
    })

    it('falls back to codeload tarballs when GitHub tree API is rate-limited', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/acme/agent-kit') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/acme/agent-kit/git/trees/main?recursive=1') {
                return new Response('rate limited', { status: 403 })
            }
            if (href === 'https://codeload.github.com/acme/agent-kit/tar.gz/main') {
                return tarballResponse([
                    'agent-kit-main/README.md',
                    'agent-kit-main/skills/research/SKILL.md',
                ])
            }
            if (href === 'https://raw.githubusercontent.com/acme/agent-kit/main/skills/research/SKILL.md') {
                return new Response('---\nname: research\ndescription: Research skill\n---\n\nResearch deeply.')
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await previewApmPackagesFromGitHub({
            source: 'acme/agent-kit',
            format: 'skill-md',
            limit: 10,
        })

        expect(result.candidates).toEqual([
            expect.objectContaining({
                kind: 'skill',
                name: 'research',
                sourcePath: 'skills/research/SKILL.md',
            }),
        ])
    })

    it('lists import-verified preset repos as package import entrypoints', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/anthropics/skills') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/addyosmani/agent-skills') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/wshobson/agents') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/vercel-labs/agent-skills') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-claude-code-subagents/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'categories/01-core-development/api-designer.md' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/categories/01-core-development/api-designer.md') {
                return new Response('---\nname: api-designer\ndescription: Design APIs carefully.\n---\n\nAPI design guidance.')
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-codex-subagents') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-codex-subagents/git/trees/main?recursive=1') {
                return jsonResponse({
                    tree: [
                        { type: 'blob', path: 'categories/01-core-development/backend-developer.toml' },
                    ],
                })
            }
            if (href === 'https://raw.githubusercontent.com/VoltAgent/awesome-codex-subagents/main/categories/01-core-development/backend-developer.toml') {
                return new Response('name = "backend-developer"\ndescription = "Build backend paths."\ndeveloper_instructions = """\nOwn backend implementation.\n"""')
            }
            if (href === 'https://api.github.com/repos/disler/claude-code-hooks-mastery') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/kid-sid/claude-spellbook') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/PlagueHO/github-copilot-assets-library') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/SuperClaude-Org/SuperClaude_Plugin') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/DVC2/cursor_prompts') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/kinopeee/windsurf-antigravity-rules') {
                return jsonResponse({ default_branch: 'main' })
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await listApmGitHubSourceItems({
            sources: [
                'anthropic-skills',
                'addy-agent-skills',
                'wshobson-agents',
                'vercel-agent-skills',
                'awesome-claude-code-subagents',
                'awesome-codex-subagents',
                'disler-hooks-mastery',
                'claude-spellbook',
                'copilot-assets',
                'superclaude-plugin',
                'cursor-prompts',
                'windsurf-antigravity-rules',
            ],
            limitPerSource: 2,
        })

        expect(result.primitives).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'package',
                repo: 'anthropics/skills',
                importRequest: expect.objectContaining({ source: 'anthropics/skills' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'addyosmani/agent-skills',
                importRequest: expect.objectContaining({ source: 'addyosmani/agent-skills' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'wshobson/agents',
                importRequest: expect.objectContaining({ source: 'wshobson/agents' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'vercel-labs/agent-skills',
                importRequest: expect.objectContaining({ source: 'vercel-labs/agent-skills' }),
            }),
            expect.objectContaining({
                kind: 'agent',
                repo: 'VoltAgent/awesome-claude-code-subagents',
                importRequest: expect.objectContaining({ source: 'VoltAgent/awesome-claude-code-subagents/categories/01-core-development/api-designer.md' }),
            }),
            expect.objectContaining({
                kind: 'agent',
                repo: 'VoltAgent/awesome-codex-subagents',
                importRequest: expect.objectContaining({ source: 'VoltAgent/awesome-codex-subagents/categories/01-core-development/backend-developer.toml' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'disler/claude-code-hooks-mastery',
                importRequest: expect.objectContaining({ source: 'disler/claude-code-hooks-mastery' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'kid-sid/claude-spellbook',
                importRequest: expect.objectContaining({ source: 'kid-sid/claude-spellbook' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'PlagueHO/github-copilot-assets-library',
                importRequest: expect.objectContaining({ source: 'PlagueHO/github-copilot-assets-library' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'SuperClaude-Org/SuperClaude_Plugin',
                importRequest: expect.objectContaining({ source: 'SuperClaude-Org/SuperClaude_Plugin' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'DVC2/cursor_prompts',
                importRequest: expect.objectContaining({ source: 'DVC2/cursor_prompts' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'kinopeee/windsurf-antigravity-rules',
                importRequest: expect.objectContaining({ source: 'kinopeee/windsurf-antigravity-rules' }),
            }),
        ]))
        expect(result.primitives).toHaveLength(12)
    })
})
