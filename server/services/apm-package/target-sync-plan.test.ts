import { describe, expect, it } from 'vitest'
import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts.js'
import type {
    ApmSyncRunRequest,
} from '../../../shared/apm-sync-contracts.js'
import {
    normalizeRequestedSyncUnit,
    normalizeSyncTargets,
    targetSupportsPackage,
} from './target-sync-plan.js'

function packageSummary(input: {
    agents?: number
    instructions?: number
    skills?: number
    prompts?: number
    commands?: number
    hooks?: number
    mcp?: number
    kind?: ApmPackageSummary['kind']
}): ApmPackageSummary {
    return {
        packageId: 'pkg-1',
        name: 'Package',
        kind: input.kind || 'agent',
        agentComponents: {
            instructions: 0,
            skills: 0,
            mcp: input.mcp || 0,
            model: false,
        },
        microsoftApm: {
            packageRoot: '/tmp/package',
            sourceDir: '/tmp/package/.apm',
            installCommand: 'apm install /tmp/package',
            validateCommand: 'apm validate /tmp/package',
            packCommand: 'apm pack /tmp/package',
            primitiveCounts: {
                agents: input.agents || 0,
                instructions: input.instructions || 0,
                skills: input.skills || 0,
                prompts: input.prompts || 0,
                commands: input.commands || 0,
                hooks: input.hooks || 0,
            },
            primitivePaths: [],
            warnings: [],
        },
        source: 'apm',
    }
}

describe('target sync planning', () => {
    it('normalizes requested targets and rejects empty target lists', () => {
        expect(normalizeSyncTargets(['codex', 'codex', 'claude'])).toEqual(['codex', 'claude'])
        expect(() => normalizeSyncTargets([])).toThrow('At least one APM sync target is required')
        expect(() => normalizeSyncTargets(['unknown'] as unknown as ApmSyncRunRequest['targets']))
            .toThrow('Unsupported APM sync target: unknown')
    })

    it('normalizes sync units without silently accepting unsupported units', () => {
        expect(normalizeRequestedSyncUnit(undefined)).toBe('studio-agent')
        expect(normalizeRequestedSyncUnit('skills')).toBe('skills')
        expect(normalizeRequestedSyncUnit('commands')).toBe('commands')
        expect(() => normalizeRequestedSyncUnit('unknown' as ApmSyncRunRequest['syncUnit']))
            .toThrow('Unsupported APM sync unit: unknown')
    })

    it('treats Studio Agent export as an agent-scoped unit for Codex and Claude', () => {
        const skillAndMcpPackage = packageSummary({ skills: 1, mcp: 1, kind: 'skill' })
        const agentAndSkillPackage = packageSummary({ agents: 1, skills: 1 })

        expect(targetSupportsPackage('codex', agentAndSkillPackage, 'studio-agent')).toBe(true)
        expect(targetSupportsPackage('claude', agentAndSkillPackage, 'studio-agent')).toBe(true)
        expect(targetSupportsPackage('gemini', agentAndSkillPackage, 'studio-agent')).toBe(false)
        expect(targetSupportsPackage('agent-skills', agentAndSkillPackage, 'studio-agent')).toBe(false)
        expect(targetSupportsPackage('codex', skillAndMcpPackage, 'studio-agent')).toBe(false)

        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'skills')).toBe(true)
        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'mcp')).toBe(true)
        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'agents')).toBe(false)
        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'instructions')).toBe(false)
        expect(targetSupportsPackage('agent-skills', skillAndMcpPackage, 'skills')).toBe(true)
    })

    it('uses target capability rules for CLI-first prompt, command, and hook units', () => {
        const promptPackage = packageSummary({ prompts: 1, commands: 1 })
        const hookPackage = packageSummary({ hooks: 1 })

        expect(targetSupportsPackage('copilot', promptPackage, 'prompts')).toBe(true)
        expect(targetSupportsPackage('claude', promptPackage, 'commands')).toBe(true)
        expect(targetSupportsPackage('opencode', promptPackage, 'commands')).toBe(true)
        expect(targetSupportsPackage('codex', promptPackage, 'commands')).toBe(false)
        expect(targetSupportsPackage('codex', hookPackage, 'hooks')).toBe(true)
        expect(targetSupportsPackage('opencode', hookPackage, 'hooks')).toBe(false)
    })
})
