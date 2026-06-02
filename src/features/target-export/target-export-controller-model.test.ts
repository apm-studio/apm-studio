import { describe, expect, it } from 'vitest'
import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncRunResponse,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetSummary,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-sync-contracts'
import {
    buildTargetExportControllerModel,
    normalizeTargetExportStagedPackages,
    normalizeTargetExportStagedScopeCopies,
    normalizeTargetExportTargetSelection,
} from './target-export-controller-model'
import type { TargetExportScopedPackage } from './target-export-sync-utils'

function packageSummary(partial: Partial<ApmPackageSummary>): ApmPackageSummary {
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

function projectPackage(partial: Partial<ApmPackageSummary> = {}): TargetExportScopedPackage {
    return {
        ...packageSummary(partial),
        scope: 'workspace',
    }
}

function userPackage(partial: Partial<ApmPackageSummary> = {}): TargetExportScopedPackage {
    return {
        ...packageSummary(partial),
        scope: 'user',
    }
}

function definitionSummary(partial: Partial<ApmSyncTargetDefinitionSummary>): ApmSyncTargetDefinitionSummary {
    return {
        id: 'definition',
        target: 'codex',
        name: 'planner',
        kind: 'agent',
        path: '.codex/agents/planner.toml',
        syncUnit: 'agents',
        managed: false,
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

function targetsResponse(targets: ApmSyncTargetSummary[]): ApmSyncTargetsResponse {
    return {
        tooling: {
            available: true,
            recommendedCommand: 'uvx apm',
            runners: [],
            installHints: [],
            deploymentNote: 'CLI first.',
        },
        targets,
    }
}

function syncResult(rows: ApmSyncRunResponse['results']): ApmSyncRunResponse {
    return {
        ok: true,
        targets: ['codex'],
        syncUnit: 'agents',
        startedAt: 1,
        finishedAt: 2,
        results: rows,
    }
}

describe('Target export controller model', () => {
    it('normalizes staged package and target selection against available model ids', () => {
        expect(normalizeTargetExportStagedPackages([], ['a', 'b'])).toEqual([])
        expect(normalizeTargetExportStagedPackages(['a', 'stale'], ['a', 'b'])).toEqual(['a'])
        expect(normalizeTargetExportStagedPackages(['stale'], ['a', 'b'])).toEqual([])
        expect(normalizeTargetExportTargetSelection(['gemini', 'codex'], ['codex'])).toEqual(['codex'])
        expect(normalizeTargetExportTargetSelection(['gemini'], [])).toEqual([])
        expect(normalizeTargetExportStagedScopeCopies([
            { packageId: 'skill-1', fromScope: 'user', toScope: 'workspace' },
            { packageId: 'missing', fromScope: 'user', toScope: 'workspace' },
        ], {
            user: ['skill-1'],
            workspace: [],
        })).toEqual([
            { packageId: 'skill-1', fromScope: 'user', toScope: 'workspace' },
        ])
    })

    it('builds the active target comparison model from Studio packages, target definitions, and last sync results', () => {
        const pkg = projectPackage({
            packageId: 'planner',
            agentName: 'Planner',
            agentComponents: {
                instructions: 0,
                skills: 1,
                mcp: 0,
                model: true,
            },
        })
        const managedDefinition = definitionSummary({
            id: 'managed-planner',
            managed: true,
            managedPackageId: 'planner',
        })
        const targetOnlyDefinition = definitionSummary({
            id: 'target-only',
            name: 'manual-agent',
            managed: false,
            path: '.codex/agents/manual-agent.toml',
        })

        const model = buildTargetExportControllerModel({
            projectPackages: [pkg],
            userPackages: [],
            targetsResponse: targetsResponse([
                targetSummary({
                    definitions: [managedDefinition, targetOnlyDefinition],
                    currentItems: [{
                        packageId: 'planner',
                        target: 'codex',
                        syncUnit: 'agents',
                        artifactCount: 1,
                        artifacts: ['.codex/agents/planner.toml'],
                        updatedAt: '2026-05-29T00:00:00.000Z',
                    }],
                }),
            ]),
            selectedSyncUnit: 'agents',
            selectedTargets: ['codex'],
            stagedPackageIds: ['planner'],
            stagedScopeCopies: [],
            exportChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: syncResult([{
                packageId: 'planner',
                name: 'Planner',
                target: 'codex',
                syncUnit: 'agents',
                command: 'apm install',
                status: 'synced',
                artifacts: ['.codex/agents/planner.toml'],
            }]),
        })

        expect(model.activeTarget?.id).toBe('codex')
        expect(model.activeSavePackageIds).toEqual(['planner'])
        expect(model.activeTargetDefinitionByPackage.get('planner')?.id).toBe('managed-planner')
        expect(model.targetOnlyDefinitions.map((definition) => definition.id)).toEqual(['target-only'])
        expect(model.activeTargetCurrentByPackage.get('planner')?.artifactCount).toBe(1)
        expect(model.activeTargetResultByPackage.get('planner')?.status).toBe('synced')
        expect(model.activeTargetPackageExportStateByPackage.get('planner')).toBe('synced')
        expect(model.unsyncedPackageIds).toEqual([])
        expect(model.activeTargetPlanSteps).toEqual(expect.arrayContaining([
            'Build a temp package from Agents.',
            'Keep model settings inside Studio runtime.',
        ]))
        expect(model.saveDisabled).toBe(false)
    })

    it('uses primitive-specific target output hints in the save plan', () => {
        const model = buildTargetExportControllerModel({
            projectPackages: [projectPackage({
                packageId: 'docs',
                name: 'Docs',
                kind: 'instruction',
                microsoftApm: {
                    packageRoot: '/tmp/docs',
                    sourceDir: '/tmp/docs/.apm',
                    installCommand: 'apm install .',
                    validateCommand: 'apm validate .',
                    packCommand: 'apm pack .',
                    primitiveCounts: { agents: 0, instructions: 1, skills: 0 },
                    primitivePaths: ['.apm/instructions/docs.instructions.md'],
                    warnings: [],
                },
            })],
            userPackages: [],
            targetsResponse: targetsResponse([
                targetSummary({
                    id: 'claude',
                    label: 'Claude',
                    outputHint: '.claude/ + .mcp.json',
                    outputHints: {
                        instructions: '.claude/rules/ + CLAUDE.md',
                    },
                    supportedSyncUnits: ['instructions'],
                }),
            ]),
            selectedSyncUnit: 'instructions',
            selectedTargets: ['claude'],
            stagedPackageIds: ['docs'],
            stagedScopeCopies: [],
            exportChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.activeTargetPlanSteps).toContain('Write managed project files into .claude/rules/ + CLAUDE.md.')
    })

    it('marks local packages without target ownership as unsynced and excludes managed local definitions from target-only rows', () => {
        const syncedPkg = projectPackage({
            packageId: 'synced',
            name: 'Synced',
        })
        const unsyncedPkg = projectPackage({
            packageId: 'unsynced',
            name: 'Unsynced',
        })

        const model = buildTargetExportControllerModel({
            projectPackages: [syncedPkg, unsyncedPkg],
            userPackages: [],
            targetsResponse: targetsResponse([
                targetSummary({
                    definitions: [
                        definitionSummary({
                            id: 'managed-synced',
                            managed: true,
                            managedPackageId: 'synced',
                        }),
                        definitionSummary({
                            id: 'manual-target-only',
                            managed: false,
                            name: 'manual-target-only',
                        }),
                    ],
                }),
            ]),
            selectedSyncUnit: 'agents',
            selectedTargets: ['codex'],
            stagedPackageIds: [],
            stagedScopeCopies: [],
            exportChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.activeTargetPackageExportStateByPackage.get('synced')).toBe('synced')
        expect(model.activeTargetPackageExportStateByPackage.get('unsynced')).toBe('unsynced')
        expect(model.unsyncedPackageIds).toEqual(['unsynced'])
        expect(model.targetOnlyDefinitions.map((definition) => definition.id)).toEqual(['manual-target-only'])
    })

    it('disables save when every active source item is marked skip', () => {
        const model = buildTargetExportControllerModel({
            projectPackages: [projectPackage({ packageId: 'planner' })],
            userPackages: [],
            targetsResponse: targetsResponse([targetSummary({})]),
            selectedSyncUnit: 'agents',
            selectedTargets: ['codex'],
            stagedPackageIds: ['planner'],
            stagedScopeCopies: [],
            exportChoices: {
                'codex:planner': 'skip',
            },
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.activeSavePackageIds).toEqual([])
        expect(model.saveDisabled).toBe(true)
    })

    it('keeps unsupported but installed targets selectable while blocking save', () => {
        const model = buildTargetExportControllerModel({
            projectPackages: [projectPackage({ packageId: 'planner' })],
            userPackages: [],
            targetsResponse: targetsResponse([
                targetSummary({
                    id: 'gemini',
                    label: 'Gemini',
                    supportedSyncUnits: ['skills'],
                }),
            ]),
            selectedSyncUnit: 'agents',
            selectedTargets: ['gemini'],
            stagedPackageIds: ['planner'],
            stagedScopeCopies: [],
            exportChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.activeTarget?.id).toBe('gemini')
        expect(model.selectableTargetIds).toEqual(['gemini'])
        expect(model.availableTargetIds).toEqual([])
        expect(model.saveDisabled).toBe(true)
        expect(model.activeTargetAvailability?.reason).toBe('Gemini does not support Agents.')
    })

    it('keeps save disabled until packages are staged', () => {
        const model = buildTargetExportControllerModel({
            projectPackages: [projectPackage({ packageId: 'planner' })],
            userPackages: [],
            targetsResponse: targetsResponse([targetSummary({})]),
            selectedSyncUnit: 'agents',
            selectedTargets: ['codex'],
            stagedPackageIds: [],
            stagedScopeCopies: [],
            exportChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.stagedPackages).toEqual([])
        expect(model.activeSavePackageIds).toEqual([])
        expect(model.saveDisabled).toBe(true)
    })

    it('filters source packages to the selected primitive unit', () => {
        const model = buildTargetExportControllerModel({
            projectPackages: [
                projectPackage({
                    packageId: 'agent-only',
                    microsoftApm: {
                        packageRoot: '/tmp/agent-only',
                        sourceDir: '/tmp/agent-only/.apm',
                        installCommand: 'apm install .',
                        validateCommand: 'apm validate .',
                        packCommand: 'apm pack .',
                        primitiveCounts: { agents: 1, instructions: 0, skills: 0 },
                        primitivePaths: [],
                        warnings: [],
                    },
                }),
                projectPackage({
                    packageId: 'skill-only',
                    kind: 'skill',
                    microsoftApm: {
                        packageRoot: '/tmp/skill-only',
                        sourceDir: '/tmp/skill-only/.apm',
                        installCommand: 'apm install .',
                        validateCommand: 'apm validate .',
                        packCommand: 'apm pack .',
                        primitiveCounts: { agents: 0, instructions: 0, skills: 1 },
                        primitivePaths: [],
                        warnings: [],
                    },
                }),
            ],
            userPackages: [],
            targetsResponse: targetsResponse([targetSummary({})]),
            selectedSyncUnit: 'skills',
            selectedTargets: ['codex'],
            stagedPackageIds: [],
            stagedScopeCopies: [],
            exportChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.syncableProjectPackages.map((pkg) => pkg.packageId)).toEqual(['skill-only'])
    })

    it('enables save for staged user/workspace package copies without target export rows', () => {
        const model = buildTargetExportControllerModel({
            projectPackages: [],
            userPackages: [userPackage({ packageId: 'review-skill', kind: 'skill' })],
            targetsResponse: targetsResponse([targetSummary({})]),
            selectedSyncUnit: 'skills',
            selectedTargets: ['codex'],
            stagedPackageIds: [],
            stagedScopeCopies: [{
                packageId: 'review-skill',
                fromScope: 'user',
                toScope: 'workspace',
            }],
            exportChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.activeSavePackageIds).toEqual([])
        expect(model.syncableUserPackages.map((pkg) => pkg.packageId)).toEqual(['review-skill'])
        expect(model.saveDisabled).toBe(false)
        expect(model.activeTargetPlanSteps).toEqual(expect.arrayContaining([
            'Copy 1 package between User and Workspace.',
        ]))
    })
})
