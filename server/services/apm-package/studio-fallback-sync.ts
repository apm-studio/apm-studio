import type {
    ApmSyncUnit,
    ApmSyncPackageResult,
    ApmSyncTargetId,
} from '../../../shared/apm-sync-contracts.js'
import {
    readSyncOwnershipManifest,
    writeSyncOwnershipManifest,
    type ManagedSyncWriteContext,
} from './sync-ownership.js'
import {
    syncTargetProfile,
    targetSupportsSyncUnit,
} from './sync-targets.js'
import {
    fallbackProjectionLabel,
    projectStudioFallbackArtifacts,
    type StudioFallbackProjectionParts,
} from './studio-fallback-artifacts.js'
import { loadStudioFallbackSyncPackage } from './studio-fallback-package.js'

function injectCommand(packageId: string, target: ApmSyncTargetId) {
    return `apm-studio manage ${packageId} --target ${target}`
}

function skippedFallbackResult(input: {
    packageId: string
    name: string
    target: ApmSyncTargetId
    syncUnit: ApmSyncUnit
    projectedAs: string
    warnings: string[]
}): ApmSyncPackageResult {
    return {
        packageId: input.packageId,
        name: input.name,
        target: input.target,
        syncUnit: input.syncUnit,
        command: injectCommand(input.packageId, input.target),
        status: 'skipped',
        projectedAs: input.projectedAs,
        warnings: input.warnings,
    }
}

function fallbackProjectionParts(target: ApmSyncTargetId, syncUnit: ApmSyncUnit): StudioFallbackProjectionParts {
    if (
        syncUnit === 'instructions'
        || syncUnit === 'prompts'
        || syncUnit === 'commands'
        || syncUnit === 'hooks'
        || syncUnit === 'mcp'
    ) {
        return {
            includeAgent: false,
            includeSkills: false,
        }
    }
    return {
        includeAgent: syncUnit !== 'skills' && target !== 'agent-skills',
        includeSkills: syncUnit !== 'agents',
    }
}

function unsupportedPrimitiveWarnings(
    target: ApmSyncTargetId,
    syncUnit: ApmSyncUnit,
    parts: StudioFallbackProjectionParts,
) {
    const targetProfile = syncTargetProfile(target)
    if (syncUnit === 'studio-agent' && !targetSupportsSyncUnit(target, 'studio-agent')) {
        return [`${targetProfile.label} does not support Studio Agent export.`]
    }
    if (parts.includeAgent && !targetSupportsSyncUnit(target, 'agents')) {
        return [`${targetProfile.label} does not support APM agent primitives.`]
    }
    if (parts.includeSkills && !targetSupportsSyncUnit(target, 'skills')) {
        return [`${targetProfile.label} does not support APM skill primitives.`]
    }
    if (!parts.includeAgent && !parts.includeSkills) {
        return [`Studio fallback does not sync ${syncUnit} yet.`]
    }
    return null
}

function fallbackWarnings(input: {
    hasModel: boolean
    mcpServerCount: number
}) {
    const warnings: string[] = []
    if (input.hasModel) {
        warnings.push('Model selection is Studio Agent runtime-only and was omitted from target artifacts.')
    }
    if (input.mcpServerCount > 0) {
        warnings.push('MCP server names are preserved in the package; target MCP config writing is deferred until Studio has concrete server configs.')
    }
    return warnings
}

export async function syncPackageWithStudioFallback(
    workingDir: string,
    packageId: string,
    target: ApmSyncTargetId,
    syncUnit: ApmSyncUnit = 'studio-agent',
): Promise<ApmSyncPackageResult> {
    const projectedAs = fallbackProjectionLabel(target, syncUnit)
    const parts = fallbackProjectionParts(target, syncUnit)
    const primitiveWarnings = unsupportedPrimitiveWarnings(target, syncUnit, parts)

    if (primitiveWarnings) {
        return skippedFallbackResult({
            packageId,
            name: packageId,
            target,
            syncUnit,
            projectedAs,
            warnings: primitiveWarnings,
        })
    }

    const syncPackage = await loadStudioFallbackSyncPackage(workingDir, packageId)
    if (!syncPackage) {
        return skippedFallbackResult({
            packageId,
            name: packageId,
            target,
            syncUnit,
            projectedAs,
            warnings: ['Unable to read this APM package for Studio fallback projection.'],
        })
    }

    if (parts.includeAgent && !syncPackage.hasAgent) {
        return skippedFallbackResult({
            packageId,
            name: syncPackage.name,
            target,
            syncUnit,
            projectedAs,
            warnings: ['This sync unit needs an APM agent primitive, but the selected package does not contain one.'],
        })
    }

    const startedWarnings = fallbackWarnings({
        hasModel: syncPackage.model !== null,
        mcpServerCount: syncPackage.mcpServerNames.length,
    })
    const ownership = await readSyncOwnershipManifest(workingDir)
    const context: ManagedSyncWriteContext = {
        workingDir,
        packageId,
        target,
        syncUnit,
        source: 'studio-fallback',
        ownership,
    }
    const artifacts = await projectStudioFallbackArtifacts({
        target,
        syncPackage,
        parts,
        context,
    })
    await writeSyncOwnershipManifest(workingDir, ownership)

    return {
        packageId,
        name: syncPackage.name,
        target,
        syncUnit,
        command: injectCommand(packageId, target),
        status: artifacts.length > 0 ? 'synced' : 'skipped',
        projectedAs,
        artifacts,
        warnings: artifacts.length > 0 ? startedWarnings : [...startedWarnings, 'No matching fallback artifacts were produced for this sync unit.'],
        modelOmitted: syncPackage.model !== null,
        stdout: artifacts.join('\n'),
        stderr: startedWarnings.join('\n') || undefined,
    }
}
