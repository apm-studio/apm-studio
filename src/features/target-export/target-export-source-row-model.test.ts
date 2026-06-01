import { describe, expect, it } from 'vitest'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import {
    buildTargetExportPackageDragPayload,
    buildTargetExportSourcePackageRowModel,
} from './target-export-source-row-model'

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

describe('Target export source row model', () => {
    it('marks staged source packages as ready and includes primitive/model badges', () => {
        expect(buildTargetExportSourcePackageRowModel({
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
            staged: true,
            syncUnit: 'agents',
            targetState: 'unsynced',
        })).toEqual(expect.objectContaining({
            badges: expect.arrayContaining(['1 agent', 'model: Studio only']),
            detail: 'Plans work.',
            packageId: 'planner',
            packageName: 'Planner Agent',
            staged: true,
            stateClass: 'is-ready',
            status: 'Staged',
        }))
    })

    it('shows unsynced and synced target states before staging', () => {
        expect(buildTargetExportSourcePackageRowModel({
            pkg: packageSummary(),
            staged: false,
            syncUnit: 'agents',
            targetState: 'unsynced',
        })).toEqual(expect.objectContaining({
            status: 'Unsynced',
            stateClass: 'is-unsynced',
        }))

        expect(buildTargetExportSourcePackageRowModel({
            pkg: packageSummary(),
            staged: false,
            syncUnit: 'agents',
            targetState: 'synced',
        })).toEqual(expect.objectContaining({
            status: 'Synced',
            stateClass: 'is-ready',
        }))
    })

    it('marks package warnings as check state when the source package is not staged', () => {
        const row = buildTargetExportSourcePackageRowModel({
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
            staged: false,
            syncUnit: 'agents',
        })

        expect(row.status).toBe('Check')
        expect(row.stateClass).toBe('is-warning')
        expect(row.detail).toBe('Review imported source.')
    })

    it('uses an empty badge when a source package has no selected-unit primitives', () => {
        const row = buildTargetExportSourcePackageRowModel({
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
            staged: false,
            syncUnit: 'skills',
        })

        expect(row.badges).toEqual(['empty'])
        expect(row.status).toBe('No unit')
        expect(row.stateClass).toBe('is-warning')
    })

    it('includes the selected sync unit in drag payloads', () => {
        expect(buildTargetExportPackageDragPayload(packageSummary({ agentName: 'Planner Agent' }), 'skills'))
            .toEqual(expect.objectContaining({
                kind: 'apm-package',
                packageId: 'planner',
                scope: 'workspace',
                source: 'workspace',
                syncUnit: 'skills',
                label: 'Planner Agent',
            }))
    })
})
