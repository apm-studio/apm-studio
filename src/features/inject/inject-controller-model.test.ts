import { describe, expect, it } from 'vitest'
import type {
    ApmPackageSummary,
    ApmSyncRunResponse,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetSummary,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-contracts'
import {
    buildInjectControllerModel,
    normalizeInjectPackageSelection,
    normalizeInjectTargetSelection,
} from './inject-controller-model'

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
        supportedSyncUnits: ['agent-packages', 'agents', 'skills'],
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

describe('Inject controller model', () => {
    it('normalizes package and target selection against available model ids', () => {
        expect(normalizeInjectPackageSelection([], ['a', 'b'])).toEqual(['a', 'b'])
        expect(normalizeInjectPackageSelection(['a', 'stale'], ['a', 'b'])).toEqual(['a'])
        expect(normalizeInjectPackageSelection(['stale'], ['a', 'b'])).toEqual(['a', 'b'])
        expect(normalizeInjectTargetSelection(['gemini', 'codex'], ['codex'])).toEqual(['codex'])
        expect(normalizeInjectTargetSelection(['gemini'], [])).toEqual([])
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

        const model = buildInjectControllerModel({
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
            selectedPackageIds: ['planner'],
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
        expect(model.activeTargetPlanSteps).toEqual(expect.arrayContaining([
            'Build a temp package from Agents.',
            'Keep model settings inside Studio Run.',
        ]))
        expect(model.syncDisabled).toBe(false)
    })

    it('disables sync when every active source item is marked skip', () => {
        const model = buildInjectControllerModel({
            apmPackages: [packageSummary({ packageId: 'planner' })],
            targetsResponse: targetsResponse([targetSummary({})]),
            selectedSyncUnit: 'agents',
            selectedTargets: ['codex'],
            selectedPackageIds: ['planner'],
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
})
