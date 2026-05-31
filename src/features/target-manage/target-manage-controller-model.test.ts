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
    buildTargetManageControllerModel,
    normalizeTargetManageStagedPackages,
    normalizeTargetManageTargetSelection,
} from './target-manage-controller-model'

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
        supportedSyncUnits: ['studio-agent', 'agents', 'skills'],
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

describe('Target manage controller model', () => {
    it('normalizes staged package and target selection against available model ids', () => {
        expect(normalizeTargetManageStagedPackages([], ['a', 'b'])).toEqual([])
        expect(normalizeTargetManageStagedPackages(['a', 'stale'], ['a', 'b'])).toEqual(['a'])
        expect(normalizeTargetManageStagedPackages(['stale'], ['a', 'b'])).toEqual([])
        expect(normalizeTargetManageTargetSelection(['gemini', 'codex'], ['codex'])).toEqual(['codex'])
        expect(normalizeTargetManageTargetSelection(['gemini'], [])).toEqual([])
    })

    it('builds the active target comparison model from Studio packages, target definitions, and last sync results', () => {
        const pkg = packageSummary({
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

        const model = buildTargetManageControllerModel({
            apmPackages: [pkg],
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
            filter: '',
            syncChoices: {},
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
        expect(model.activePushPackageIds).toEqual(['planner'])
        expect(model.activeTargetDefinitionByPackage.get('planner')?.id).toBe('managed-planner')
        expect(model.targetOnlyDefinitions.map((definition) => definition.id)).toEqual(['target-only'])
        expect(model.activeTargetCurrentByPackage.get('planner')?.artifactCount).toBe(1)
        expect(model.activeTargetResultByPackage.get('planner')?.status).toBe('synced')
        expect(model.activeTargetPackageSyncStateByPackage.get('planner')).toBe('synced')
        expect(model.unsyncedPackageIds).toEqual([])
        expect(model.activeTargetPlanSteps).toEqual(expect.arrayContaining([
            'Build a temp package from APM Agents.',
            'Keep model settings inside Studio Agent runtime.',
        ]))
        expect(model.syncDisabled).toBe(false)
    })

    it('marks local packages without target ownership as unsynced and excludes managed local definitions from target-only rows', () => {
        const syncedPkg = packageSummary({
            packageId: 'synced',
            name: 'Synced',
        })
        const unsyncedPkg = packageSummary({
            packageId: 'unsynced',
            name: 'Unsynced',
        })

        const model = buildTargetManageControllerModel({
            apmPackages: [syncedPkg, unsyncedPkg],
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
            filter: '',
            syncChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.activeTargetPackageSyncStateByPackage.get('synced')).toBe('synced')
        expect(model.activeTargetPackageSyncStateByPackage.get('unsynced')).toBe('unsynced')
        expect(model.unsyncedPackageIds).toEqual(['unsynced'])
        expect(model.targetOnlyDefinitions.map((definition) => definition.id)).toEqual(['manual-target-only'])
    })

    it('disables sync when every active source item is marked skip', () => {
        const model = buildTargetManageControllerModel({
            apmPackages: [packageSummary({ packageId: 'planner' })],
            targetsResponse: targetsResponse([targetSummary({})]),
            selectedSyncUnit: 'agents',
            selectedTargets: ['codex'],
            stagedPackageIds: ['planner'],
            filter: '',
            syncChoices: {
                'codex:planner': 'skip',
            },
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.activePushPackageIds).toEqual([])
        expect(model.syncDisabled).toBe(true)
    })

    it('keeps unsupported but installed targets selectable while blocking sync', () => {
        const model = buildTargetManageControllerModel({
            apmPackages: [packageSummary({ packageId: 'planner' })],
            targetsResponse: targetsResponse([
                targetSummary({
                    id: 'gemini',
                    label: 'Gemini',
                    supportedSyncUnits: ['skills'],
                }),
            ]),
            selectedSyncUnit: 'studio-agent',
            selectedTargets: ['gemini'],
            stagedPackageIds: ['planner'],
            filter: '',
            syncChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.activeTarget?.id).toBe('gemini')
        expect(model.selectableTargetIds).toEqual(['gemini'])
        expect(model.availableTargetIds).toEqual([])
        expect(model.syncDisabled).toBe(true)
        expect(model.activeTargetAvailability?.reason).toBe('Gemini does not support Studio Agent export.')
    })

    it('keeps sync disabled until packages are staged', () => {
        const model = buildTargetManageControllerModel({
            apmPackages: [packageSummary({ packageId: 'planner' })],
            targetsResponse: targetsResponse([targetSummary({})]),
            selectedSyncUnit: 'agents',
            selectedTargets: ['codex'],
            stagedPackageIds: [],
            filter: '',
            syncChoices: {},
            loadingTargets: false,
            running: false,
            lastResult: null,
        })

        expect(model.stagedPackages).toEqual([])
        expect(model.activePushPackageIds).toEqual([])
        expect(model.syncDisabled).toBe(true)
    })
})
