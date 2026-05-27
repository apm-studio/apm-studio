import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { importApmPackagesFromGitHub, listApmGitHubSourceAssets, previewApmPackagesFromGitHub } from './github-import.js'
import { readApmPackage } from './repository.js'

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
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-github-'))
    })

    afterEach(async () => {
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
        })
    })

    it('can import GitHub packages into the global package workspace', async () => {
        const globalDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-global-'))
        vi.stubEnv('APM_STUDIO_HOME', globalDir)
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
            scope: 'global',
        })

        expect(result.scope).toBe('global')
        expect(result.targetWorkingDir).toBe(globalDir)
        expect(await readApmPackage(globalDir, result.packages[0].packageId)).not.toBeNull()
        expect(await readApmPackage(workingDir, result.packages[0].packageId)).toBeNull()

        await fs.rm(globalDir, { recursive: true, force: true }).catch(() => {})
    })

    it('lists source assets converted from supported GitHub preset repos', async () => {
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
            if (href === 'https://api.github.com/repos/VoltAgent/awesome-agent-skills') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/README.md') {
                return new Response([
                    '### Official Claude Skills',
                    '- **[anthropics/docx](https://officialskills.sh/anthropics/skills/docx)** - Create, edit, and analyze Word documents',
                    '### Skills by Angular',
                    '- **[angular/angular-developer](https://github.com/angular/skills)** - Generate Angular code and architectural guidance',
                ].join('\n'))
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await listApmGitHubSourceAssets({
            sources: ['awesome-claude-code-subagents', 'awesome-agent-skills'],
            limitPerSource: 2,
        })

        expect(result.sources.map((source) => source.id).sort()).toEqual([
            'awesome-agent-skills',
            'awesome-claude-code-subagents',
        ])
        expect(result.assets).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'agent',
                name: 'code-reviewer',
                sourceName: 'Claude Code Subagents',
                importRequest: {
                    source: 'VoltAgent/awesome-claude-code-subagents/categories/04-quality-security/code-reviewer.md',
                    format: 'claude-md',
                    limit: 1,
                },
            }),
            expect.objectContaining({
                kind: 'skill',
                name: 'docx',
                sourceName: 'Agent Skills Index',
                sourceUrl: 'https://officialskills.sh/anthropics/skills/docx',
            }),
            expect.objectContaining({
                kind: 'skill',
                name: 'angular-developer',
                sourceName: 'Agent Skills Index',
                sourceUrl: 'https://github.com/angular/skills',
            }),
        ]))
        expect(result.assets).toHaveLength(3)
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
            primitiveCounts: { agents: 1, instructions: 0, skills: 0 },
        })
        expect(result.candidates.map((candidate) => candidate.sourcePath)).not.toContain('prompts/release.prompt.md')
        expect(await readApmPackage(workingDir, result.candidates[0].packageId)).toBeNull()
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

    it('lists high-star preset repos as package import entrypoints', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = url.toString()
            if (href === 'https://api.github.com/repos/github/awesome-copilot') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/addyosmani/agent-skills') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/vercel-labs/skills') {
                return jsonResponse({ default_branch: 'main' })
            }
            if (href === 'https://api.github.com/repos/microsoft/skills') {
                return jsonResponse({ default_branch: 'main' })
            }
            return new Response('not found', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await listApmGitHubSourceAssets({
            sources: ['awesome-copilot', 'addy-agent-skills', 'vercel-skills', 'microsoft-skills'],
            limitPerSource: 2,
        })

        expect(result.assets).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'package',
                repo: 'github/awesome-copilot',
                stars: 33901,
                importRequest: expect.objectContaining({ format: 'auto' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'addyosmani/agent-skills',
                stars: 46358,
                importRequest: expect.objectContaining({ source: 'addyosmani/agent-skills' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'vercel-labs/skills',
                stars: 20238,
                importRequest: expect.objectContaining({ source: 'vercel-labs/skills' }),
            }),
            expect.objectContaining({
                kind: 'package',
                repo: 'microsoft/skills',
                stars: 2399,
                importRequest: expect.objectContaining({ source: 'microsoft/skills' }),
            }),
        ]))
        expect(result.assets).toHaveLength(4)
    })
})
