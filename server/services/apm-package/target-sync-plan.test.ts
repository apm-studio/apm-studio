import { describe, expect, it } from 'vitest'
import type {
    ApmPackageSummary,
    ApmSyncRunRequest,
} from '../../../shared/apm-contracts.js'
import {
    normalizeRequestedSyncUnit,
    normalizeSyncTargets,
    targetSupportsPackage,
} from './target-sync-plan.js'

function packageSummary(input: {
    agents?: number
    instructions?: number
    skills?: number
    mcp?: number
}): ApmPackageSummary {
    return {
        packageId: 'pkg-1',
        name: 'Package',
        kind: 'agent',
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
        expect(normalizeRequestedSyncUnit(undefined)).toBe('agent-packages')
        expect(normalizeRequestedSyncUnit('skills')).toBe('skills')
        expect(() => normalizeRequestedSyncUnit('commands' as ApmSyncRunRequest['syncUnit']))
            .toThrow('Unsupported APM sync unit: commands')
    })

    it('treats agent packages as composite units that require all contained primitives', () => {
        const skillAndMcpPackage = packageSummary({ skills: 1, mcp: 1 })
        const agentAndSkillPackage = packageSummary({ agents: 1, skills: 1 })

        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'agent-packages')).toBe(true)
        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'skills')).toBe(true)
        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'mcp')).toBe(true)
        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'agents')).toBe(false)
        expect(targetSupportsPackage('gemini', skillAndMcpPackage, 'instructions')).toBe(false)

        expect(targetSupportsPackage(
            'gemini',
            agentAndSkillPackage,
            'agent-packages',
        )).toBe(false)
        expect(targetSupportsPackage('agent-skills', skillAndMcpPackage, 'agent-packages')).toBe(false)
        expect(targetSupportsPackage('agent-skills', skillAndMcpPackage, 'skills')).toBe(true)
    })
})
