import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { toProjectionPath, updateGitExclude } from './projection-manifest.js'

describe('projection path normalization', () => {
    it('uses forward slashes for OpenCode agent and manifest paths', () => {
        expect(toProjectionPath('apm-studio\\workspace\\hash\\agent--build')).toBe('apm-studio/workspace/hash/agent--build')
        expect(toProjectionPath('.opencode\\agents\\apm-studio\\workspace\\hash\\agent--build.md')).toBe('.opencode/agents/apm-studio/workspace/hash/agent--build.md')
    })

    it('keeps generated OpenCode excludes under the Studio marker', async () => {
        const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-manifest-'))
        try {
            const excludePath = path.join(workingDir, '.git', 'info', 'exclude')
            await fs.mkdir(path.dirname(excludePath), { recursive: true })
            await fs.writeFile(excludePath, [
                '# apm-studio projection (auto-managed)',
                '.opencode/agents/apm-studio/',
                '.opencode/skills/apm-studio/',
                '.opencode/apm-studio.manifest.json',
                '',
            ].join('\n'), 'utf-8')

            await updateGitExclude(workingDir)

            const content = await fs.readFile(excludePath, 'utf-8')
            expect(content).toContain('.opencode/agents/apm-studio/')
            expect(content.match(/\.opencode\/agents\/apm-studio\//g)).toHaveLength(1)
            expect(content).toContain('.opencode/skills/apm-studio/')
            expect(content.match(/\.opencode\/skills\/apm-studio\//g)).toHaveLength(1)
            expect(content).toContain('.opencode/apm-studio.manifest.json')
            expect(content).not.toContain('.codex/')
            expect(content).not.toContain('.agents/skills/')
        } finally {
            await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
        }
    })
})
