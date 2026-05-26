import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { toProjectionPath, updateGitExclude } from './projection-manifest.js'

describe('projection path normalization', () => {
    it('uses forward slashes for OpenCode agent and manifest paths', () => {
        expect(toProjectionPath('8pm-studio\\workspace\\hash\\performer--build')).toBe('8pm-studio/workspace/hash/performer--build')
        expect(toProjectionPath('.opencode\\agents\\8pm-studio\\workspace\\hash\\performer--build.md')).toBe('.opencode/agents/8pm-studio/workspace/hash/performer--build.md')
    })

    it('adds generated Codex agent excludes to existing Studio markers', async () => {
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), '8pm-studio-manifest-'))
        try {
            const excludePath = path.join(workingDir, '.git', 'info', 'exclude')
            await fs.mkdir(path.dirname(excludePath), { recursive: true })
            await fs.writeFile(excludePath, [
                '# 8pm-studio projection (auto-managed)',
                '.opencode/agents/8pm-studio/',
                '.opencode/skills/8pm-studio/',
                '.opencode/8pm-studio.manifest.json',
                '',
            ].join('\n'), 'utf-8')

            await updateGitExclude(workingDir)

            const content = await fs.readFile(excludePath, 'utf-8')
            expect(content).toContain('.codex/agents/8pm_studio_*.toml')
            expect(content.match(/\.codex\/agents\/8pm_studio_\*\.toml/g)).toHaveLength(1)
            expect(content).toContain('.agents/skills/8pm-studio-*')
            expect(content.match(/\.agents\/skills\/8pm-studio-\*/g)).toHaveLength(1)
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })
})
