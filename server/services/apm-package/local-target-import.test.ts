import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { readApmPackage } from './repository.js'
import { collectTargetDefinitions } from './target-definitions.js'
import { readSyncOwnershipManifest } from './sync-ownership.js'
import { importApmPackageFromTargetDefinition } from './local-target-import.js'

describe('local target definition import', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-local-target-import-'))
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    it('imports an unmanaged target skill directory into a workspace APM package without claiming ownership', async () => {
        const skillDir = path.join(workingDir, '.claude', 'skills', 'research')
        await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true })
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), [
            '---',
            'name: research',
            'description: Research deeply',
            '---',
            '',
            'Use primary sources.',
        ].join('\n'), 'utf-8')
        await fs.writeFile(path.join(skillDir, 'scripts', 'check.sh'), 'echo research\n', 'utf-8')

        const response = await importApmPackageFromTargetDefinition(workingDir, {
            target: 'claude',
            path: '.claude/skills/research/SKILL.md',
        })
        const packageId = response.packages[0].packageId
        const pkg = await readApmPackage(workingDir, packageId)
        const ownership = await readSyncOwnershipManifest(workingDir)
        const definitions = await collectTargetDefinitions(workingDir, 'claude', ownership)

        expect(response.packages[0]).toEqual(expect.objectContaining({
            name: 'research',
            kind: 'skill',
            sourcePath: '.claude/skills/research/SKILL.md',
        }))
        expect(pkg?.manifest.target).toEqual(['claude'])
        expect(pkg?.manifest.marketplace?.source).toEqual({
            type: 'target',
            target: 'claude',
            path: '.claude/skills/research/SKILL.md',
        })
        expect(pkg?.microsoftApm?.primitiveCounts.skills).toBe(1)
        await expect(fs.readFile(path.join(
            workingDir,
            'packages',
            packageId,
            '.apm',
            'skills',
            'research',
            'scripts',
            'check.sh',
        ), 'utf-8')).resolves.toContain('research')
        expect(definitions.find((definition) => definition.path === '.claude/skills/research/SKILL.md'))
            .toEqual(expect.objectContaining({ managed: false }))
    })

    it('imports a Codex agent target file as a Studio-runnable agent package', async () => {
        const agentPath = path.join(workingDir, '.codex', 'agents', 'planner.toml')
        await fs.mkdir(path.dirname(agentPath), { recursive: true })
        await fs.writeFile(agentPath, [
            'name = "Planner"',
            'description = "Plans work"',
            'model = "openai/gpt-5.4"',
            'developer_instructions = "Plan carefully."',
        ].join('\n'), 'utf-8')

        const response = await importApmPackageFromTargetDefinition(workingDir, {
            target: 'codex',
            path: '.codex/agents/planner.toml',
        })
        const packageId = response.packages[0].packageId
        const pkg = await readApmPackage(workingDir, packageId)

        expect(response.packages[0]).toEqual(expect.objectContaining({
            name: 'planner',
            kind: 'agent',
        }))
        expect(pkg?.manifest['x-apm']?.agent).toEqual(expect.objectContaining({
            agentName: 'planner',
            agentBody: 'Plan carefully.',
            derivedFrom: 'target:codex:.codex/agents/planner.toml',
        }))
        expect(pkg?.microsoftApm?.primitiveCounts.agents).toBe(1)
        await expect(fs.readFile(path.join(
            workingDir,
            'packages',
            packageId,
            '.apm',
            'agents',
            'planner.agent.md',
        ), 'utf-8')).resolves.toContain('Plan carefully.')
    })

    it('imports MCP target config while preserving self-defined server details', async () => {
        const mcpPath = path.join(workingDir, '.codex', 'mcp.json')
        await fs.mkdir(path.dirname(mcpPath), { recursive: true })
        await fs.writeFile(mcpPath, JSON.stringify({
            mcpServers: {
                filesystem: {
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
                    env: { SAFE_MODE: '1' },
                },
            },
        }), 'utf-8')

        const response = await importApmPackageFromTargetDefinition(workingDir, {
            target: 'codex',
            path: '.codex/mcp.json',
        })
        const packageId = response.packages[0].packageId
        const pkg = await readApmPackage(workingDir, packageId)

        expect(response.packages[0]).toEqual(expect.objectContaining({
            kind: 'mcp',
            sourcePath: '.codex/mcp.json',
        }))
        expect(pkg?.manifest.target).toEqual(['codex'])
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
    })
})
