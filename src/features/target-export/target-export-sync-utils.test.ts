import { describe, expect, it } from 'vitest'
import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetSummary,
} from '../../../shared/apm-sync-contracts'
import {
    findManagedDefinitionForPackage,
    packageReadiness,
    primitiveSummary,
    targetAvailability,
    targetOutputHint,
    targetPackageAvailability,
} from './target-export-sync-utils'

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
        supportedSyncUnits: ['agents', 'skills'],
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

describe('Target export utils', () => {
    it('summarizes selected primitive counts without empty units', () => {
        const counts = { agents: 1, instructions: 0, skills: 2, prompts: 0, commands: 0, hooks: 0, mcp: 0 }

        expect(primitiveSummary(counts, 'agents')).toBe('1 agent')
        expect(primitiveSummary(counts, 'skills')).toBe('2 skills')
        expect(primitiveSummary(counts, 'mcp')).toBe('No MCP')
    })

    it('blocks primitive export when a target cannot receive the selected primitive', () => {
        const target = targetSummary({
            label: 'Gemini',
            supportedSyncUnits: ['skills', 'mcp'],
        })
        expect(targetAvailability(target, 'agents')).toEqual({
            available: false,
            reason: 'Gemini does not support Agents.',
        })
    })

    it('returns primitive-specific target output hints when available', () => {
        const target = targetSummary({
            outputHint: '.claude/ + .mcp.json',
            outputHints: {
                instructions: '.claude/rules/ + CLAUDE.md',
                mcp: '.mcp.json + .claude/mcp.json',
            },
        })

        expect(targetOutputHint(target, 'instructions')).toBe('.claude/rules/ + CLAUDE.md')
        expect(targetOutputHint(target, 'mcp')).toBe('.mcp.json + .claude/mcp.json')
        expect(targetOutputHint(target, 'skills')).toBe('.claude/ + .mcp.json')
    })

    it('blocks package staging when the package lacks the selected primitive unit', () => {
        const target = targetSummary({
            supportedSyncUnits: ['skills'],
        })
        const pkg = packageSummary({
            name: 'Planner',
            microsoftApm: {
                packageRoot: '/tmp/planner',
                sourceDir: '/tmp/planner/.apm',
                installCommand: 'apm install .',
                validateCommand: 'apm validate .',
                packCommand: 'apm pack .',
                primitiveCounts: { agents: 1, instructions: 0, skills: 0 },
                primitivePaths: [],
                warnings: [],
            },
        })

        expect(targetPackageAvailability(target, 'skills', pkg)).toEqual({
            available: false,
            reason: 'Planner does not contain Skills.',
        })
    })

    it('describes ready packages with export language', () => {
        const pkg = packageSummary({
            microsoftApm: {
                packageRoot: '/tmp/planner',
                sourceDir: '/tmp/planner/.apm',
                installCommand: 'apm install .',
                validateCommand: 'apm validate .',
                packCommand: 'apm pack .',
                primitiveCounts: { agents: 1, instructions: 0, skills: 0 },
                primitivePaths: [],
                warnings: [],
            },
        })

        expect(packageReadiness(pkg, 'agents')).toEqual({
            label: 'Ready',
            title: 'Agents can be exported from this package.',
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

})
