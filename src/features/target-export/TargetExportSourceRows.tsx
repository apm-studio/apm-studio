import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Bot, Boxes, FileText, GripVertical, PackageOpen, Server, Zap } from 'lucide-react'
import type { ApmPackageScope } from '../../../shared/apm-contracts'
import type { ApmSyncTargetSummary } from '../../../shared/apm-sync-contracts'
import {
    buildTargetExportPackageDragPayload,
    buildTargetExportSourcePackageRowModel,
} from './target-export-source-row-model'
import {
    targetExportScopeCopyKey,
    type TargetExportScopeCopy,
} from './target-export-controller-model'
import {
    packageScopeLabel,
    targetPackageAvailability,
    type TargetExportScopedPackage,
    unitLabel,
} from './target-export-sync-utils'
import type { TargetExportControllerState } from './useTargetExportController'

interface TargetExportSourceRowsProps {
    activeTarget: ApmSyncTargetSummary | null
    allowTargetStage: boolean
    copyActionLabel: string
    copyTargetScope: ApmPackageScope
    packageExportStateByPackage: TargetExportControllerState['activeTargetPackageExportStateByPackage']
    packages: TargetExportScopedPackage[]
    running: boolean
    stagePackageForActiveTarget: TargetExportControllerState['stagePackageForActiveTarget']
    stagedPackageSet: TargetExportControllerState['stagedPackageSet']
    stagedScopeCopySet: TargetExportControllerState['stagedScopeCopySet']
    selectedSyncUnit: TargetExportControllerState['selectedSyncUnit']
    toggleStagedPackage: TargetExportControllerState['toggleStagedPackage']
    toggleStagedScopeCopy: TargetExportControllerState['toggleStagedScopeCopy']
}

function packageIcon(kind: string) {
    if (kind === 'agent') return <Bot size={12} className="primitive-icon agent" />
    if (kind === 'skill') return <Zap size={12} className="primitive-icon skill" />
    if (kind === 'instruction') return <FileText size={12} className="primitive-icon instruction" />
    if (kind === 'prompt' || kind === 'command') return <FileText size={12} className="primitive-icon instruction" />
    if (kind === 'hook') return <Zap size={12} className="primitive-icon skill" />
    if (kind === 'mcp') return <Server size={12} className="primitive-icon mcp" />
    return <PackageOpen size={12} className="primitive-icon combo" />
}

function packagePath(pkg: TargetExportScopedPackage) {
    return pkg.microsoftApm?.packageRoot || pkg.manifestPath || 'package root unavailable'
}

function scopeCopyKey(packageId: string, fromScope: ApmPackageScope, toScope: ApmPackageScope) {
    return targetExportScopeCopyKey({ packageId, fromScope, toScope } satisfies TargetExportScopeCopy)
}

function TargetExportSourceCard({
    activeTarget,
    allowTargetStage,
    copyActionLabel,
    copyTargetScope,
    packageExportStateByPackage,
    pkg,
    running,
    stagePackageForActiveTarget,
    stagedScopeCopySet,
    targetStaged,
    selectedSyncUnit,
    toggleStagedPackage,
    toggleStagedScopeCopy,
}: {
    activeTarget: ApmSyncTargetSummary | null
    allowTargetStage: boolean
    copyActionLabel: string
    copyTargetScope: ApmPackageScope
    packageExportStateByPackage: TargetExportControllerState['activeTargetPackageExportStateByPackage']
    pkg: TargetExportScopedPackage
    running: boolean
    stagePackageForActiveTarget: TargetExportControllerState['stagePackageForActiveTarget']
    stagedScopeCopySet: TargetExportControllerState['stagedScopeCopySet']
    targetStaged: boolean
    selectedSyncUnit: TargetExportControllerState['selectedSyncUnit']
    toggleStagedPackage: TargetExportControllerState['toggleStagedPackage']
    toggleStagedScopeCopy: TargetExportControllerState['toggleStagedScopeCopy']
}) {
    const copyStaged = stagedScopeCopySet.has(scopeCopyKey(pkg.packageId, pkg.scope, copyTargetScope))
    const row = buildTargetExportSourcePackageRowModel({
        pkg,
        staged: targetStaged || copyStaged,
        syncUnit: selectedSyncUnit,
        targetState: allowTargetStage ? packageExportStateByPackage.get(pkg.packageId) : undefined,
    })
    const availability = allowTargetStage && activeTarget
        ? targetPackageAvailability(activeTarget, selectedSyncUnit, pkg)
        : { available: false, reason: null }
    const dragPayload = useMemo(() => (
        buildTargetExportPackageDragPayload(pkg, selectedSyncUnit)
    ), [pkg, selectedSyncUnit])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `target-export-source-${pkg.scope}-${selectedSyncUnit}-${pkg.packageId}`,
        data: dragPayload,
        disabled: running,
    })
    const title = allowTargetStage
        ? availability.reason || `Drag to ${activeTarget?.label || 'target'} or stage ${unitLabel(selectedSyncUnit)} for export.`
        : `Drag to ${packageScopeLabel(copyTargetScope)} or use ${copyActionLabel}.`

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`package-card package-summary-card target-export-source-card ${row.stateClass} ${isDragging ? 'is-dragging' : ''} ${targetStaged || copyStaged ? 'is-selected' : ''}`}
            title={title}
        >
            <div className="package-card__header">
                <GripVertical size={10} className="drag-handle" />
                {packageIcon(pkg.kind)}
                <span className="package-card__name" title={row.packageName}>{row.packageName}</span>
                <span className={`primitive-sync-badge target-export-source-card__status ${row.stateClass}`}>
                    {row.status}
                </span>
            </div>
            <div className="package-card__author" title={`${unitLabel(selectedSyncUnit)} · ${pkg.packageId}`}>
                {unitLabel(selectedSyncUnit)} · {pkg.packageId}
            </div>
            <div className="package-card__desc" title={row.detail}>
                {row.detail}
            </div>
            <div className="package-summary-card__primitive-map" aria-label={`${row.packageName} primitives`}>
                {row.badges.map((badge) => (
                    <span key={badge} className="package-summary-card__primitive-chip">
                        {badge}
                    </span>
                ))}
            </div>
            <div className="target-export-source-card__footer">
                <div className="package-summary-card__path" title={packagePath(pkg)}>
                    <Boxes size={10} />
                    <span>{packagePath(pkg)}</span>
                </div>
                <div className="target-export-source-card__actions">
                    {allowTargetStage ? (
                        <button
                            type="button"
                            className="btn btn--sm target-export-source-card__action"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation()
                                if (targetStaged) {
                                    toggleStagedPackage(row.packageId)
                                    return
                                }
                                void stagePackageForActiveTarget(row.packageId, selectedSyncUnit)
                            }}
                            disabled={running}
                            title={availability.reason || 'Stage export changes for the selected target'}
                        >
                            {targetStaged ? 'Remove' : 'Add'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="btn btn--sm target-export-source-card__action"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation()
                            toggleStagedScopeCopy(pkg.packageId, pkg.scope, copyTargetScope)
                        }}
                        disabled={running}
                        title={`Stage copy to ${packageScopeLabel(copyTargetScope)}`}
                    >
                        {copyStaged ? 'Remove' : copyActionLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

export function TargetExportSourceRows({
    activeTarget,
    allowTargetStage,
    copyActionLabel,
    copyTargetScope,
    packageExportStateByPackage,
    packages,
    running,
    stagePackageForActiveTarget,
    stagedPackageSet,
    stagedScopeCopySet,
    selectedSyncUnit,
    toggleStagedPackage,
    toggleStagedScopeCopy,
}: TargetExportSourceRowsProps) {
    return (
        <div className="target-export-source-card-list">
            {packages.map((pkg) => (
                <TargetExportSourceCard
                    key={`${pkg.scope}:${pkg.packageId}`}
                    activeTarget={activeTarget}
                    allowTargetStage={allowTargetStage}
                    copyActionLabel={copyActionLabel}
                    copyTargetScope={copyTargetScope}
                    packageExportStateByPackage={packageExportStateByPackage}
                    pkg={pkg}
                    running={running}
                    stagePackageForActiveTarget={stagePackageForActiveTarget}
                    stagedScopeCopySet={stagedScopeCopySet}
                    targetStaged={allowTargetStage && stagedPackageSet.has(pkg.packageId)}
                    selectedSyncUnit={selectedSyncUnit}
                    toggleStagedPackage={toggleStagedPackage}
                    toggleStagedScopeCopy={toggleStagedScopeCopy}
                />
            ))}
        </div>
    )
}
