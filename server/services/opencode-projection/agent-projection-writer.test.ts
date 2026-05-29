import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { CompiledAgent } from './agent-compiler.js'
import type { CompiledSkill } from './skill-compiler.js'
import { applyAgentProjectionFiles } from './agent-projection-writer.js'

describe('agent projection writer', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-agent-projection-writer-'))
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    function compiledAgent(skill: CompiledSkill): CompiledAgent {
        return {
            agentId: 'agent-1',
            agentNames: {
                build: 'apm-studio/workspace/hash/agent-1--build',
                plan: 'apm-studio/workspace/hash/agent-1--plan',
            },
            agentPaths: {
                build: path.join(workingDir, '.opencode', 'agents', 'agent-1--build.md'),
                plan: path.join(workingDir, '.opencode', 'agents', 'agent-1--plan.md'),
            },
            agentContents: {
                build: 'build agent',
                plan: 'plan agent',
            },
            skills: [skill],
            projectionHash: 'hash',
            allFiles: [
                '.opencode/agents/agent-1--build.md',
                '.opencode/agents/agent-1--plan.md',
                skill.relativePath,
            ],
        }
    }

    function compiledSkill(): CompiledSkill {
        return {
            logicalName: 'review',
            description: 'Review',
            filePath: path.join(workingDir, '.opencode', 'skills', 'review', 'SKILL.md'),
            relativePath: '.opencode/skills/review/SKILL.md',
            content: '# Review\n',
            additionalFiles: [],
            bundleChanged: false,
        }
    }

    it('writes compiled projection files, managed extra tools, and the projection manifest', async () => {
        const staleTool = path.join(workingDir, '.opencode', 'tools', 'message_teammate.ts')
        await fs.mkdir(path.dirname(staleTool), { recursive: true })
        await fs.writeFile(staleTool, 'stale tool', 'utf-8')

        const skill = compiledSkill()
        const changed = await applyAgentProjectionFiles({
            workingDir,
            workspaceHash: 'hash',
            agentId: 'agent-1',
            compiled: compiledAgent(skill),
            skills: [skill],
            extraTools: [{
                name: 'wait_until',
                content: 'export default {}\n',
            }],
        })

        expect(changed).toBe(true)
        await expect(fs.access(staleTool)).rejects.toBeTruthy()
        await expect(fs.readFile(path.join(workingDir, '.opencode', 'tools', 'wait_until.ts'), 'utf-8'))
            .resolves.toBe('export default {}\n')
        await expect(fs.readFile(path.join(workingDir, '.opencode', 'agents', 'agent-1--build.md'), 'utf-8'))
            .resolves.toBe('build agent')
        await expect(fs.readFile(skill.filePath, 'utf-8')).resolves.toBe('# Review\n')

        const manifest = JSON.parse(await fs.readFile(path.join(workingDir, '.opencode', 'apm-studio.manifest.json'), 'utf-8'))
        expect(manifest).toEqual(expect.objectContaining({
            owner: 'apm-studio',
            workspaceHash: 'hash',
            runtime: expect.objectContaining({
                projectionPending: true,
            }),
        }))
        expect(manifest.groups['agent:agent-1']).toEqual(expect.arrayContaining([
            '.opencode/agents/agent-1--build.md',
            '.opencode/agents/agent-1--plan.md',
            '.opencode/skills/review/SKILL.md',
            '.opencode/tools/wait_until.ts',
        ]))
    })
})
