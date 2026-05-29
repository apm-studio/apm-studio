import { describe, expect, it } from 'vitest'
import type {
    ApmPackageSummary,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetSummary,
} from '../../../shared/apm-contracts'
import {
    findManagedDefinitionForPackage,
    packageSearchHaystack,
    primitiveSummary,
    targetAvailability,
} from './inject-sync-utils'

function packageSummary(partial: Partial<ApmPackageSummary>): ApmPackageSummary {
    return {
        packageId: 'planner',
        name: 'Planner',
        kind: 'agent',
        source: 'apm',
        ...partial,
    }
}

function targetSummary(partial: Partial<ApmSyncTargetSummary>): ApmSyncTargetSummary {
    return {
        id: 'codex',
        label: 'Codex',
        description: 'Codex target',
        outputHint: '.codex',
        commandPreview: 'apm install <package> --target codex',
        available: true,
        supportedSyncUnits: ['agent-packages', 'agents', 'skills'],
        strategy: 'cli-first',
        currentItems: [],
        definitions: [],
        ...partial,
    }
}

function definitionSummary(partial: Partial<ApmSyncTargetDefinitionSummary>): ApmSyncTargetDefinitionSummary {
    return {
        id: 'definition',
        target: 'codex',
        name: 'planner',
        kind: 'agent',
        path: '.codex/agents/planner.toml',
        managed: false,
        ...partial,
    }
}

describe('Inject sync utils', () => {
    it('summarizes selected primitive counts without empty units', () => {
        const counts = { agents: 1, instructions: 0, skills: 2, mcp: 0 }

        expect(primitiveSummary(counts)).toBe('1 agent, 2 skills')
        expect(primitiveSummary(counts, 'mcp')).toBe('No MCP')
    })

    it('blocks agent package sync when a target cannot receive every package primitive', () => {
        const target = targetSummary({
            label: 'Gemini',
            supportedSyncUnits: ['agent-packages', 'skills', 'mcp'],
        })
        const pkg = packageSummary({
            microsoftApm: {
                packageRoot: '/tmp/planner',
                sourceDir: '/tmp/planner/.apm',
                installCommand: 'apm install .',
                validateCommand: 'apm validate .',
                packCommand: 'apm pack .',
                primitiveCounts: { agents: 1, instructions: 0, skills: 1 },
                primitivePaths: [],
                warnings: [],
            },
        })

        expect(targetAvailability(target, 'agent-packages', [pkg])).toEqual({
            available: false,
            reason: 'Gemini cannot receive every primitive in Planner.',
        })
    })

    it('matches target definitions only by managed package id', () => {
        const pkg = packageSummary({ packageId: 'planner-agent', name: 'Planner Agent' })
        const definitions = [
            definitionSummary({
                id: 'name-match',
                name: 'planner-agent',
            }),
            definitionSummary({
                id: 'managed-match',
                name: 'custom-name',
                managedPackageId: 'planner-agent',
            }),
        ]

        expect(findManagedDefinitionForPackage(definitions, pkg)?.id).toBe('managed-match')
    })

    it('does not guess unmanaged target definitions by name or path', () => {
        const pkg = packageSummary({ packageId: 'planner-agent', name: 'Planner Agent' })

        expect(findManagedDefinitionForPackage([
            definitionSummary({ id: 'name-match', name: 'Planner Agent', path: '.codex/agents/other.toml' }),
            definitionSummary({ id: 'path-match', name: 'other', path: '.codex/agents/planner-agent.toml' }),
        ], pkg)).toBeNull()
    })

    it('includes primitive counts in package search text', () => {
        const pkg = packageSummary({
            microsoftApm: {
                packageRoot: '/tmp/planner',
                sourceDir: '/tmp/planner/.apm',
                installCommand: 'apm install .',
                validateCommand: 'apm validate .',
                packCommand: 'apm pack .',
                primitiveCounts: { agents: 1, instructions: 2, skills: 3 },
                primitivePaths: [],
                warnings: [],
            },
        })

        expect(packageSearchHaystack(pkg)).toContain('1 agents 2 instructions 3 skills 0 mcp')
    })
})
