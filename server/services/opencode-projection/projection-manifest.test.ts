import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { toProjectionPath, updateGitExclude } from './projection-manifest.js'

describe('projection path normalization', () => {
    it('uses forward slashes for OpenCode agent and manifest paths', () => {
        expect(toProjectionPath('agent-roster\\workspace\\hash\\performer--build')).toBe('agent-roster/workspace/hash/performer--build')
        expect(toProjectionPath('.opencode\\agents\\agent-roster\\workspace\\hash\\performer--build.md')).toBe('.opencode/agents/agent-roster/workspace/hash/performer--build.md')
    })

    it('adds new generated Codex agent excludes to existing Studio markers', async () => {
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-roster-manifest-'))
        try {
            const excludePath = path.join(workingDir, '.git', 'info', 'exclude')
            await fs.mkdir(path.dirname(excludePath), { recursive: true })
            await fs.writeFile(excludePath, [
                '# dot-studio projection (auto-managed)',
                '.opencode/agents/dot-studio/',
                '.opencode/skills/dot-studio/',
                '.opencode/dot-studio.manifest.json',
                '',
            ].join('\n'), 'utf-8')

            await updateGitExclude(workingDir)

            const content = await fs.readFile(excludePath, 'utf-8')
            expect(content).toContain('.codex/agents/agent_roster_*.toml')
            expect(content.match(/\.codex\/agents\/agent_roster_\*\.toml/g)).toHaveLength(1)
            expect(content).toContain('.agents/skills/agent-roster-*')
            expect(content.match(/\.agents\/skills\/agent-roster-\*/g)).toHaveLength(1)
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })
})
