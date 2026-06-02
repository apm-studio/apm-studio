import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { compileSkill } from './skill-compiler.js'

describe('compileSkill', () => {
    let workingDir: string

    beforeEach(async () => {
        workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-skill-compiler-'))
    })

    afterEach(async () => {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {})
    })

    it('compiles installed APM package skill refs for Studio Agent runtime projection', async () => {
        const packageId = 'company-analysis-32382e13'
        const skillDir = path.join(workingDir, 'packages', packageId, '.apm', 'skills', 'company-analysis')
        await fs.mkdir(path.join(skillDir, 'references'), { recursive: true })
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), [
            '---',
            'name: company-analysis',
            'description: Analyze companies through a finance workflow.',
            '---',
            '',
            '# Company Analysis',
            '',
            'Use this skill when analyzing a company.',
            '',
        ].join('\n'), 'utf-8')
        await fs.writeFile(path.join(skillDir, 'references', 'checklist.md'), 'Check valuation, risk, and catalysts.\n', 'utf-8')

        const compiled = await compileSkill(
            workingDir,
            { kind: 'registry', urn: `apm-package/workspace/${packageId}` },
            'workspace-hash',
            'agent-1',
            workingDir,
        )

        expect(compiled).toHaveLength(1)
        expect(compiled[0]).toEqual(expect.objectContaining({
            logicalName: 'company-analysis',
            description: 'Analyze companies through a finance workflow.',
            relativePath: '.opencode/skills/apm-studio/workspace/workspace-hash/agent-1/company-analysis/SKILL.md',
            additionalFiles: [
                '.opencode/skills/apm-studio/workspace/workspace-hash/agent-1/company-analysis/references/checklist.md',
            ],
        }))
        expect(compiled[0].content).toContain('Use this skill when analyzing a company.')
        await expect(fs.readFile(
            path.join(
                workingDir,
                '.opencode',
                'skills',
                'apm-studio',
                'workspace',
                'workspace-hash',
                'agent-1',
                'company-analysis',
                'references',
                'checklist.md',
            ),
            'utf-8',
        )).resolves.toContain('Check valuation')
    })

    it('continues to reject non-package registry skill refs', async () => {
        await expect(compileSkill(
            workingDir,
            { kind: 'registry', urn: '/@acme/legacy-skill' },
            'workspace-hash',
            'agent-1',
            workingDir,
        )).rejects.toThrow('Registry skill references are no longer supported: /@acme/legacy-skill')
    })
})
