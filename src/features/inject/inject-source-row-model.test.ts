import { describe, expect, it } from 'vitest'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import { buildInjectSourcePackageRowModel } from './inject-source-row-model'

function packageSummary(partial: Partial<ApmPackageSummary> = {}): ApmPackageSummary {
    return {
        packageId: 'planner',
        name: 'Planner',
        kind: 'agent',
        source: 'apm',
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
        ...partial,
    }
}

describe('Inject source row model', () => {
    it('marks selected source packages as ready and includes primitive/model badges', () => {
        expect(buildInjectSourcePackageRowModel({
            pkg: packageSummary({
                agentName: 'Planner Agent',
                description: 'Plans work.',
                agentComponents: {
                    instructions: 0,
                    skills: 1,
                    mcp: 0,
                    model: true,
                },
            }),
            selected: true,
            syncUnit: 'agent-packages',
        })).toEqual(expect.objectContaining({
            badges: expect.arrayContaining(['1 agent', '1 skill', 'model: Run only']),
            detail: 'Plans work.',
            packageId: 'planner',
            packageName: 'Planner Agent',
            selected: true,
            stateClass: 'is-ready',
            status: 'Selected',
        }))
    })

    it('marks package warnings as check state when the source package is not selected', () => {
        const row = buildInjectSourcePackageRowModel({
            pkg: packageSummary({
                microsoftApm: {
                    packageRoot: '/tmp/planner',
                    sourceDir: '/tmp/planner/.apm',
                    installCommand: 'apm install .',
                    validateCommand: 'apm validate .',
                    packCommand: 'apm pack .',
                    primitiveCounts: { agents: 1, instructions: 0, skills: 0 },
                    primitivePaths: [],
                    warnings: ['Review imported source.'],
                },
            }),
            selected: false,
            syncUnit: 'agents',
        })

        expect(row.status).toBe('Check')
        expect(row.stateClass).toBe('is-warning')
        expect(row.detail).toBe('Review imported source.')
    })

    it('uses an empty badge when a source package has no selected-unit primitives', () => {
        const row = buildInjectSourcePackageRowModel({
            pkg: packageSummary({
                microsoftApm: {
                    packageRoot: '/tmp/planner',
                    sourceDir: '/tmp/planner/.apm',
                    installCommand: 'apm install .',
                    validateCommand: 'apm validate .',
                    packCommand: 'apm pack .',
                    primitiveCounts: { agents: 0, instructions: 0, skills: 0 },
                    primitivePaths: [],
                    warnings: [],
                },
            }),
            selected: false,
            syncUnit: 'skills',
        })

        expect(row.badges).toEqual(['empty'])
        expect(row.status).toBe('No unit')
        expect(row.stateClass).toBe('is-warning')
    })
})
