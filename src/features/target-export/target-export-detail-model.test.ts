import { describe, expect, it } from 'vitest'
import type { ApmPackageReadResponse } from '../../../shared/apm-contracts'
import type {
    ApmSyncPackageResult,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetItemSummary,
    ApmSyncTargetSummary,
} from '../../../shared/apm-sync-contracts'
import { buildTargetExportSourcePackageRowModel } from './target-export-source-row-model'
import {
    buildTargetExportSourcePrimitiveItems,
    buildTargetExportSourcePrimitiveRowModel,
} from './target-export-source-row-model'
import {
    buildTargetExportTargetOnlyDefinitionRowModel,
    buildTargetExportTargetPackageRowModel,
} from './target-export-target-row-model'
import {
    buildTargetExportSourcePackageDetailModel,
    buildTargetExportSourcePrimitiveDetailModel,
    buildTargetExportTargetOnlyDefinitionDetailModel,
    buildTargetExportTargetPackageDetailModel,
} from './target-export-detail-model'
import type { TargetExportScopedPackage } from './target-export-sync-utils'

function packageSummary(partial: Partial<TargetExportScopedPackage> = {}): TargetExportScopedPackage {
    return {
        packageId: 'planner',
        name: 'Planner',
        kind: 'agent',
        scope: 'workspace',
        source: 'apm',
        description: 'Plans work.',
        manifestPath: '/tmp/planner/apm.yml',
        agentComponents: {
            instructions: 0,
            skills: 1,
            mcp: 0,
            model: true,
        },
        microsoftApm: {
            packageRoot: '/tmp/planner',
            sourceDir: '/tmp/planner/.apm',
            installCommand: 'apm install .',
            validateCommand: 'apm validate .',
            packCommand: 'apm pack .',
            primitiveCounts: { agents: 1, instructions: 0, skills: 2, prompts: 1, commands: 0, hooks: 0, mcp: 0 },
            primitivePaths: [
                '/tmp/planner/.apm/agents/planner.agent.md',
                '/tmp/planner/.apm/skills/research/SKILL.md',
            ],
            warnings: ['Review imported source.'],
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
        supportedSyncUnits: ['agents', 'skills'],
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
        managedSyncUnit: 'agents',
        updatedAt: '2026-05-31T00:00:00.000Z',
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
        updatedAt: '2026-05-31T00:00:00.000Z',
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
        status: 'failed',
        artifacts: ['.codex/agents/planner.toml'],
        warnings: ['Fallback used.'],
        error: 'CLI failed.',
        modelOmitted: true,
        ...partial,
    }
}

function packageRead(): ApmPackageReadResponse {
    const pkg = packageSummary()
    return {
        packageId: 'planner',
        manifest: { name: 'Planner' },
        manifestHash: 'sha256:manifest',
        lockStatus: {
            state: 'current',
            manifestHash: 'sha256:manifest',
            lockManifestHash: 'sha256:manifest',
        },
        manifestYaml: 'name: Planner\n',
        microsoftApm: pkg.microsoftApm,
    }
}

describe('target export detail model', () => {
    it('builds source package details with primitive counts, warnings, and read-only manifest', () => {
        const pkg = packageSummary()
        const row = buildTargetExportSourcePackageRowModel({
            pkg,
            staged: true,
            syncUnit: 'agents',
            targetState: 'unsynced',
        })
        const model = buildTargetExportSourcePackageDetailModel({
            kind: 'source-package',
            activeTargetLabel: 'Codex',
            copyStaged: false,
            copyTargetScope: 'user',
            pkg,
            row,
            selectedSyncUnit: 'agents',
            targetStaged: true,
            targetState: 'unsynced',
        }, { packageRead: packageRead() })

        expect(model.badges).toEqual(expect.arrayContaining(['Staged', 'agent', 'Agents', 'Staged for Codex']))
        expect(model.sections.find((section) => section.title === 'Primitives')?.badges)
            .toEqual(expect.arrayContaining(['Agents: 1', 'Skills: 2', 'Prompts: 1']))
        expect(model.sections.find((section) => section.title === 'Primitives')?.tab).toBe('other')
        expect(model.sections.find((section) => section.title === 'APM Files')?.notices)
            .toEqual(expect.arrayContaining([expect.objectContaining({ text: 'Review imported source.' })]))
        expect(model.sections.find((section) => section.title === 'APM Files')?.tab).toBe('metadata')
        expect(model.sections.find((section) => section.title === 'Read-only apm.yml')?.codeBlocks)
            .toEqual([{ label: 'apm.yml', value: 'name: Planner\n' }])
        expect(model.sections.find((section) => section.title === 'Read-only apm.yml')?.tab).toBe('content')
    })

    it('builds source primitive details with primitive path and source package metadata', () => {
        const pkg = packageSummary()
        const [item] = buildTargetExportSourcePrimitiveItems([pkg], 'skills')
        const row = buildTargetExportSourcePrimitiveRowModel({
            item,
            staged: true,
            targetState: 'unsynced',
        })
        const model = buildTargetExportSourcePrimitiveDetailModel({
            kind: 'source-primitive',
            activeTargetLabel: 'Codex',
            copyStaged: false,
            copyTargetScope: 'user',
            item,
            pkg,
            row,
            selectedSyncUnit: 'skills',
            targetStaged: true,
            targetState: 'unsynced',
        }, { packageRead: packageRead() })

        expect(model.title).toBe('research')
        expect(model.subtitle).toBe('Skills source primitive')
        expect(model.badges).toEqual(expect.arrayContaining(['Staged', 'Skills', 'Staged for Codex']))
        expect(model.sections.find((section) => section.title === 'Source Primitive')?.rows)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ label: 'Name', value: 'research' }),
                expect.objectContaining({ label: 'Source path', value: '.apm/skills/research/SKILL.md' }),
            ]))
        expect(model.sections.find((section) => section.title === 'Source Package')?.rows)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ label: 'Package ID', value: 'planner' }),
                expect.objectContaining({ label: 'Package kind', value: 'agent' }),
            ]))
    })

    it('builds target package details with target state, result warnings, artifacts, and model note', () => {
        const pkg = packageSummary()
        const target = targetSummary()
        const definition = definitionSummary()
        const current = currentItem()
        const result = syncResult()
        const row = buildTargetExportTargetPackageRowModel({
            currentItem: current,
            definition,
            pkg,
            result,
            exportChoice: 'save',
            syncUnit: 'agents',
            target,
        })

        const model = buildTargetExportTargetPackageDetailModel({
            kind: 'target-package',
            activeTarget: target,
            currentItem: current,
            definition,
            exportChoice: 'save',
            pkg,
            result,
            row,
            selectedSyncUnit: 'agents',
        }, { packageError: 'Unable to read package.' })

        expect(model.badges).toEqual(expect.arrayContaining(['failed', 'Save', 'Agents']))
        expect(model.sections.find((section) => section.title === 'Target State')?.rows)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ label: 'Definition path', value: '.codex/agents/planner.toml' }),
                expect.objectContaining({ label: 'Result status', value: 'failed' }),
            ]))
        expect(model.sections.find((section) => section.title === 'Target State')?.lists)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ label: 'Current artifact paths', values: ['.codex/agents/planner.toml'] }),
            ]))
        expect(model.sections.find((section) => section.title === 'Target State')?.notices)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ text: 'CLI failed.', tone: 'danger' }),
                expect.objectContaining({ text: 'Fallback used.', tone: 'warning' }),
                expect.objectContaining({ text: expect.stringContaining('Studio-only model settings') }),
            ]))
        expect(model.sections.find((section) => section.title === 'Target State')?.tab).toBe('other')
        expect(model.sections.find((section) => section.title === 'Read-only apm.yml')?.notices)
            .toEqual([expect.objectContaining({ text: 'Unable to read package.', tone: 'danger' })])
        expect(model.sections.find((section) => section.title === 'Read-only apm.yml')?.tab).toBe('content')
    })

    it('builds target-only definition details without package metadata', () => {
        const target = targetSummary()
        const definition = definitionSummary({
            id: 'manual',
            name: 'manual-agent',
            managed: false,
            managedPackageId: undefined,
        })
        const row = buildTargetExportTargetOnlyDefinitionRowModel(definition)
        const model = buildTargetExportTargetOnlyDefinitionDetailModel({
            kind: 'target-only-definition',
            activeTarget: target,
            definition,
            row,
        })

        expect(model.title).toBe('manual-agent')
        expect(model.badges).toEqual(['Target only', 'agent', 'Agents'])
        expect(model.sections[0].rows).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'Name', value: 'manual-agent' }),
        ]))
        expect(model.sections.find((section) => section.title === 'Target-only Content')?.tab).toBe('content')
        expect(model.sections.find((section) => section.title === 'Target Definition')?.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'Definition ID', value: 'manual' }),
            expect.objectContaining({ label: 'Managed', value: 'No' }),
            expect.objectContaining({ label: 'Path', value: '.codex/agents/planner.toml' }),
        ]))
        expect(model.sections.find((section) => section.title === 'Target Definition')?.tab).toBe('metadata')
    })
})
