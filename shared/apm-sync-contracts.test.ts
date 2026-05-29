import { describe, expect, it } from 'vitest'
import {
    apmPackageHasSyncUnit,
    apmPackageSyncPrimitiveCounts,
    apmPackageSyncUnits,
    normalizeApmSyncUnit,
    sumApmPackageSyncPrimitiveCounts,
} from './apm-sync-contracts.js'
import type {
    ApmPackageSummary,
    MicrosoftApmPackageSourceSummary,
} from './apm-contracts.js'

function packageSummary(partial: Partial<ApmPackageSummary>): ApmPackageSummary {
    return {
        packageId: 'pkg',
        name: 'Package',
        kind: 'agent',
        source: 'apm',
        ...partial,
    }
}

function microsoftApmSummary(
    partial: Pick<MicrosoftApmPackageSourceSummary, 'primitiveCounts'> & Partial<MicrosoftApmPackageSourceSummary>,
): MicrosoftApmPackageSourceSummary {
    return {
        packageRoot: '/tmp/pkg',
        sourceDir: '/tmp/pkg/.apm',
        installCommand: 'apm install .',
        validateCommand: 'apm validate .',
        packCommand: 'apm pack .',
        primitivePaths: [],
        warnings: [],
        ...partial,
    }
}

describe('APM sync unit helpers', () => {
    it('derives primitive sync units from Microsoft APM primitive counts', () => {
        const pkg = packageSummary({
            microsoftApm: microsoftApmSummary({
                primitiveCounts: {
                    agents: 1,
                    instructions: 1,
                    skills: 2,
                    prompts: 0,
                },
            }),
        })

        expect(apmPackageSyncPrimitiveCounts(pkg)).toEqual({
            agents: 1,
            instructions: 1,
            skills: 2,
            mcp: 0,
        })
        expect(apmPackageSyncUnits(pkg)).toEqual(['agents', 'instructions', 'skills'])
        expect(apmPackageHasSyncUnit(pkg, 'agent-packages')).toBe(true)
        expect(apmPackageHasSyncUnit(pkg, 'mcp')).toBe(false)
    })

    it('counts standalone MCP packages as MCP sync units', () => {
        const pkg = packageSummary({
            kind: 'mcp',
            agentComponents: {
                instructions: 0,
                skills: 0,
                mcp: 0,
                model: false,
            },
        })

        expect(apmPackageSyncPrimitiveCounts(pkg).mcp).toBe(1)
        expect(apmPackageSyncUnits(pkg)).toEqual(['mcp'])
    })

    it('sums package primitive counts and rejects unknown sync units', () => {
        const packages = [
            packageSummary({
                microsoftApm: microsoftApmSummary({
                    packageRoot: '/tmp/one',
                    primitiveCounts: { agents: 1, instructions: 0, skills: 1, prompts: 0 },
                }),
            }),
            packageSummary({ kind: 'mcp' }),
        ]

        expect(sumApmPackageSyncPrimitiveCounts(packages)).toEqual({
            agents: 1,
            instructions: 0,
            skills: 1,
            mcp: 1,
        })
        expect(normalizeApmSyncUnit('skills')).toBe('skills')
        expect(normalizeApmSyncUnit('unknown')).toBeNull()
    })
})
