import { describe, expect, it } from 'vitest'
import type {
    ApmPackageSummary,
} from '../../../shared/apm-contracts'
import type {
    ApmSyncPackageResult,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetItemSummary,
    ApmSyncTargetSummary,
} from '../../../shared/apm-sync-contracts'
import {
    buildTargetManageTargetOnlyDefinitionRowModel,
    buildTargetManageTargetPackageRowModel,
} from './target-manage-target-row-model'

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

function targetSummary(partial: Partial<ApmSyncTargetSummary> = {}): ApmSyncTargetSummary {
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

function definitionSummary(partial: Partial<ApmSyncTargetDefinitionSummary> = {}): ApmSyncTargetDefinitionSummary {
    return {
        id: 'definition',
        target: 'codex',
        name: 'planner',
        kind: 'agent',
        path: '.codex/agents/planner.toml',
        syncUnit: 'agents',
        managed: true,
        managedPackageId: 'planner',
        ...partial,
    }
}

function currentItem(partial: Partial<ApmSyncTargetItemSummary> = {}): ApmSyncTargetItemSummary {
    return {
        packageId: 'planner',
        target: 'codex',
        syncUnit: 'agents',
        artifactCount: 1,
        artifacts: ['.codex/agents/planner.toml'],
        updatedAt: '2026-05-29T00:00:00.000Z',
        ...partial,
    }
}

function syncResult(partial: Partial<ApmSyncPackageResult> = {}): ApmSyncPackageResult {
    return {
        packageId: 'planner',
        name: 'Planner',
        target: 'codex',
        syncUnit: 'agents',
        command: 'apm install',
        status: 'synced',
        artifacts: ['.codex/agents/planner.toml'],
        ...partial,
    }
}

describe('Target manage target row model', () => {
    it('builds a package row from result, managed definition, current item, and model metadata', () => {
        const row = buildTargetManageTargetPackageRowModel({
            currentItem: currentItem(),
            definition: definitionSummary(),
            pkg: packageSummary({
                agentName: 'Planner Agent',
                agentComponents: {
                    instructions: 0,
                    skills: 1,
                    mcp: 0,
                    model: true,
                },
            }),
            result: syncResult({
                projectedAs: 'Codex subagent',
                modelOmitted: true,
            }),
            syncChoice: 'push',
            syncUnit: 'agents',
            target: targetSummary(),
        })

        expect(row).toEqual(expect.objectContaining({
            detail: '.codex/agents/planner.toml',
            packageName: 'Planner Agent',
            stateClass: 'is-ready',
            status: 'synced',
            syncChoice: 'push',
        }))
        expect(row.badges).toEqual(expect.arrayContaining([
            '1 agent',
            'agent',
            'Managed',
            'Codex subagent',
            'Current',
            '1 artifact',
            'model: Studio only',
        ]))
    })

    it('marks unsupported package rows as blocked and disables push through availability', () => {
        const row = buildTargetManageTargetPackageRowModel({
            pkg: packageSummary(),
            syncChoice: 'push',
            syncUnit: 'agents',
            target: targetSummary({
                label: 'Gemini',
                supportedSyncUnits: ['skills', 'mcp'],
            }),
        })

        expect(row.status).toBe('Blocked')
        expect(row.stateClass).toBe('is-warning')
        expect(row.availability.available).toBe(false)
        expect(row.detail).toBe('Gemini does not support APM Agents.')
    })

    it('makes staged push and skip choices visible before sync results exist', () => {
        expect(buildTargetManageTargetPackageRowModel({
            pkg: packageSummary(),
            syncChoice: 'push',
            syncUnit: 'agents',
            target: targetSummary(),
        }).status).toBe('Push')

        expect(buildTargetManageTargetPackageRowModel({
            pkg: packageSummary(),
            syncChoice: 'skip',
            syncUnit: 'agents',
            target: targetSummary(),
        }).status).toBe('Skip')
    })

    it('builds target-only rows without package matching assumptions', () => {
        expect(buildTargetManageTargetOnlyDefinitionRowModel(definitionSummary({
            id: 'manual',
            name: 'manual-agent',
            managed: false,
        }))).toEqual({
            badges: ['Target only', 'agent', 'APM Agents'],
            detail: '.codex/agents/planner.toml',
            id: 'manual',
            name: 'manual-agent',
            stateClass: 'is-ready',
            status: 'Keep',
        })
    })
})
