import { describe, expect, it } from 'vitest'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import {
    buildTargetExportSourcePrimitiveItems,
    buildTargetExportSourcePrimitiveRowModel,
    buildTargetExportPackageDragPayload,
    buildTargetExportSourcePackageRowModel,
} from './target-export-source-row-model'
import type { TargetExportScopedPackage } from './target-export-sync-utils'

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

function scopedPackage(partial: Partial<TargetExportScopedPackage> = {}): TargetExportScopedPackage {
    return {
        ...packageSummary(),
        scope: 'workspace',
        ...partial,
    }
}

describe('Target export source row model', () => {
    it('builds source items for the selected primitive instead of the parent package', () => {
        const items = buildTargetExportSourcePrimitiveItems([
            scopedPackage({
                packageId: 'my-agent',
                name: 'my agent',
                agentName: 'my agent',
                microsoftApm: {
                    packageRoot: '/tmp/my-agent',
                    sourceDir: '/tmp/my-agent/.apm',
                    installCommand: 'apm install .',
                    validateCommand: 'apm validate .',
                    packCommand: 'apm pack .',
                    primitiveCounts: { agents: 1, instructions: 0, skills: 1 },
                    primitivePaths: [
                        '.apm/agents/my-agent.agent.md',
                        '.apm/skills/research/SKILL.md',
                    ],
                    warnings: [],
                },
            }),
        ], 'skills')

        expect(items).toEqual([
            expect.objectContaining({
                packageId: 'my-agent',
                packageName: 'my agent',
                primitiveName: 'research',
                primitivePath: '.apm/skills/research/SKILL.md',
                syncUnit: 'skills',
            }),
        ])
    })

    it.each([
        ['agents', '.apm/agents/reviewer.agent.md', 'reviewer'],
        ['instructions', '.apm/instructions/security.instructions.md', 'security'],
        ['skills', '.apm/skills/research/SKILL.md', 'research'],
        ['prompts', '.apm/prompts/release.prompt.md', 'release'],
        ['commands', '.apm/prompts/release.prompt.md', 'release'],
        ['hooks', '.apm/hooks/pre-tool-use.json', 'pre-tool-use'],
    ] as const)('builds %s primitive items from source paths', (syncUnit, path, primitiveName) => {
        const items = buildTargetExportSourcePrimitiveItems([
            scopedPackage({
                microsoftApm: {
                    packageRoot: '/tmp/planner',
                    sourceDir: '/tmp/planner/.apm',
                    installCommand: 'apm install .',
                    validateCommand: 'apm validate .',
                    packCommand: 'apm pack .',
                    primitiveCounts: {
                        agents: syncUnit === 'agents' ? 1 : 0,
                        instructions: syncUnit === 'instructions' ? 1 : 0,
                        skills: syncUnit === 'skills' ? 1 : 0,
                        prompts: syncUnit === 'prompts' || syncUnit === 'commands' ? 1 : 0,
                        commands: syncUnit === 'commands' ? 1 : 0,
                        hooks: syncUnit === 'hooks' ? 1 : 0,
                    },
                    primitivePaths: [path],
                    warnings: [],
                },
            }),
        ], syncUnit)

        expect(items.map((item) => item.primitiveName)).toEqual([primitiveName])
        expect(items.map((item) => item.primitivePath)).toEqual([path])
    })

    it('builds mcp primitive items from manifest dependency counts', () => {
        const items = buildTargetExportSourcePrimitiveItems([
            scopedPackage({
                kind: 'mcp',
                microsoftApm: {
                    packageRoot: '/tmp/mcp',
                    sourceDir: '/tmp/mcp/.apm',
                    installCommand: 'apm install .',
                    validateCommand: 'apm validate .',
                    packCommand: 'apm pack .',
                    primitiveCounts: { agents: 0, instructions: 0, skills: 0, mcp: 2 },
                    primitivePaths: [],
                    warnings: [],
                },
            }),
        ], 'mcp')

        expect(items.map((item) => item.primitiveName)).toEqual(['MCP dependency 1', 'MCP dependency 2'])
        expect(items.map((item) => item.primitivePath)).toEqual(['apm.yml dependencies.mcp[0]', 'apm.yml dependencies.mcp[1]'])
    })

    it('builds primitive row labels from the selected primitive item', () => {
        const [item] = buildTargetExportSourcePrimitiveItems([
            scopedPackage({
                packageId: 'my-agent',
                name: 'my agent',
                microsoftApm: {
                    packageRoot: '/tmp/my-agent',
                    sourceDir: '/tmp/my-agent/.apm',
                    installCommand: 'apm install .',
                    validateCommand: 'apm validate .',
                    packCommand: 'apm pack .',
                    primitiveCounts: { agents: 1, instructions: 0, skills: 1 },
                    primitivePaths: ['.apm/skills/research/SKILL.md'],
                    warnings: [],
                },
            }),
        ], 'skills')

        const row = buildTargetExportSourcePrimitiveRowModel({
            item,
            staged: false,
            targetState: 'unsynced',
        })

        expect(row.primitiveName).toBe('research')
        expect(row.packageName).toBe('my agent')
        expect(row.badges).toEqual(['Skill', 'from my agent'])
        expect(row.status).toBe('Unsynced')
    })

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

    it('shows primitive badges for the selected sync unit', () => {
        const row = buildTargetExportSourcePackageRowModel({
            pkg: packageSummary(),
            staged: false,
            syncUnit: 'skills',
            targetState: 'unsynced',
        })

        expect(row.badges).toEqual(['1 skill'])
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
