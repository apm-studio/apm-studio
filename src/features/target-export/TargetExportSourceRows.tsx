import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { FileSearch, GripVertical } from 'lucide-react'
import type { ApmPackageScope } from '../../../shared/apm-contracts'
import type { ApmSyncTargetSummary } from '../../../shared/apm-sync-contracts'
import { TargetExportPackageIcon } from './TargetExportPackageIcon'
import {
    buildTargetExportPrimitiveDragPayload,
    buildTargetExportSourcePrimitiveRowModel,
    type TargetExportSourcePrimitiveItem,
} from './target-export-source-row-model'
import {
    targetExportScopeCopyKey,
    type TargetExportScopeCopy,
} from './target-export-controller-model'
import {
    packageScopeLabel,
    targetPackageAvailability,
    unitLabel,
} from './target-export-sync-utils'
import type { TargetExportControllerState } from './useTargetExportController'
import type { TargetExportAssetDetailRequest } from './target-export-detail-model'

interface TargetExportSourceRowsProps {
    activeTarget: ApmSyncTargetSummary | null
    allowTargetStage: boolean
    copyActionLabel: string
    copyTargetScope: ApmPackageScope
    items: TargetExportSourcePrimitiveItem[]
    packageExportStateByPackage: TargetExportControllerState['activeTargetPackageExportStateByPackage']
    running: boolean
    stagePackageForActiveTarget: TargetExportControllerState['stagePackageForActiveTarget']
    stagedPackageSet: TargetExportControllerState['stagedPackageSet']
    stagedScopeCopySet: TargetExportControllerState['stagedScopeCopySet']
    selectedSyncUnit: TargetExportControllerState['selectedSyncUnit']
    onOpenDetails: (request: TargetExportAssetDetailRequest) => void
    toggleStagedPackage: TargetExportControllerState['toggleStagedPackage']
    toggleStagedScopeCopy: TargetExportControllerState['toggleStagedScopeCopy']
}

function packagePath(item: TargetExportSourcePrimitiveItem) {
    return item.primitivePath || item.pkg.microsoftApm?.packageRoot || item.pkg.manifestPath || 'package root unavailable'
}

function visibleBadges(badges: string[]) {
    const visible = badges.slice(0, 3)
    const hidden = badges.length - visible.length
    return hidden > 0 ? [...visible, `+${hidden}`] : visible
}

function usefulDetail(detail: string | undefined) {
    if (!detail) return null
    return detail
}

function scopeCopyKey(packageId: string, fromScope: ApmPackageScope, toScope: ApmPackageScope) {
    return targetExportScopeCopyKey({ packageId, fromScope, toScope } satisfies TargetExportScopeCopy)
}

function TargetExportSourceCard({
    activeTarget,
    allowTargetStage,
    copyActionLabel,
    copyTargetScope,
    item,
    packageExportStateByPackage,
    running,
    stagePackageForActiveTarget,
    stagedScopeCopySet,
    targetStaged,
    selectedSyncUnit,
    onOpenDetails,
    toggleStagedPackage,
    toggleStagedScopeCopy,
}: {
    activeTarget: ApmSyncTargetSummary | null
    allowTargetStage: boolean
    copyActionLabel: string
    copyTargetScope: ApmPackageScope
    item: TargetExportSourcePrimitiveItem
    packageExportStateByPackage: TargetExportControllerState['activeTargetPackageExportStateByPackage']
    running: boolean
    stagePackageForActiveTarget: TargetExportControllerState['stagePackageForActiveTarget']
    stagedScopeCopySet: TargetExportControllerState['stagedScopeCopySet']
    targetStaged: boolean
    selectedSyncUnit: TargetExportControllerState['selectedSyncUnit']
    onOpenDetails: (request: TargetExportAssetDetailRequest) => void
    toggleStagedPackage: TargetExportControllerState['toggleStagedPackage']
    toggleStagedScopeCopy: TargetExportControllerState['toggleStagedScopeCopy']
}) {
    const copyStaged = stagedScopeCopySet.has(scopeCopyKey(item.packageId, item.scope, copyTargetScope))
    const targetState = packageExportStateByPackage.get(item.packageId)
    const row = buildTargetExportSourcePrimitiveRowModel({
        item,
        staged: targetStaged || copyStaged,
        targetState: allowTargetStage ? targetState : undefined,
    })
    const availability = allowTargetStage && activeTarget
        ? targetPackageAvailability(activeTarget, selectedSyncUnit, item.pkg)
        : { available: false, reason: null }
    const dragPayload = useMemo(() => (
        buildTargetExportPrimitiveDragPayload(item)
    ), [item])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `target-export-source-${item.id}`,
        data: dragPayload,
        disabled: running,
    })
    const title = allowTargetStage
        ? availability.reason || `Drag to ${activeTarget?.label || 'target'} or stage ${unitLabel(selectedSyncUnit)} for export.`
        : `Drag to ${packageScopeLabel(copyTargetScope)} or use ${copyActionLabel}.`
    const detail = usefulDetail(row.detail)

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
                <TargetExportPackageIcon pkg={item.pkg} syncUnit={selectedSyncUnit} />
                <span className="package-card__name" title={row.primitiveName}>{row.primitiveName}</span>
                <span className={`primitive-sync-badge target-export-source-card__status ${row.stateClass}`}>
                    {row.status}
                </span>
            </div>
            {detail ? (
                <div className="package-card__desc" title={detail}>
                    {detail}
                </div>
            ) : null}
            <div className="package-summary-card__primitive-map target-export-source-card__chips" aria-label={`${row.packageName} primitives`}>
                {visibleBadges(row.badges).map((badge) => (
                    <span key={badge} className="package-summary-card__primitive-chip">
                        {badge}
                    </span>
                ))}
            </div>
            <div className="target-export-source-card__footer">
                <div className="target-export-source-card__actions">
                    <button
                        type="button"
                        className="icon-btn target-export-detail-btn"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation()
                            onOpenDetails({
                                kind: 'source-primitive',
                                activeTargetLabel: activeTarget?.label,
                                copyStaged,
                                copyTargetScope,
                                item,
                                pkg: item.pkg,
                                row,
                                selectedSyncUnit,
                                targetStaged,
                                targetState,
                            })
                        }}
                        title={`View details for ${row.primitiveName} (${packagePath(item)})`}
                        aria-label={`View details for ${row.primitiveName}`}
                    >
                        <FileSearch size={12} />
                    </button>
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
                            toggleStagedScopeCopy(item.packageId, item.scope, copyTargetScope)
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
    items,
    packageExportStateByPackage,
    running,
    stagePackageForActiveTarget,
    stagedPackageSet,
    stagedScopeCopySet,
    selectedSyncUnit,
    onOpenDetails,
    toggleStagedPackage,
    toggleStagedScopeCopy,
}: TargetExportSourceRowsProps) {
    return (
        <div className="target-export-source-card-list">
            {items.map((item) => (
                <TargetExportSourceCard
                    key={item.id}
                    activeTarget={activeTarget}
                    allowTargetStage={allowTargetStage}
                    copyActionLabel={copyActionLabel}
                    copyTargetScope={copyTargetScope}
                    item={item}
                    packageExportStateByPackage={packageExportStateByPackage}
                    running={running}
                    stagePackageForActiveTarget={stagePackageForActiveTarget}
                    stagedScopeCopySet={stagedScopeCopySet}
                    targetStaged={allowTargetStage && stagedPackageSet.has(item.packageId)}
                    selectedSyncUnit={selectedSyncUnit}
                    onOpenDetails={onOpenDetails}
                    toggleStagedPackage={toggleStagedPackage}
                    toggleStagedScopeCopy={toggleStagedScopeCopy}
                />
            ))}
        </div>
    )
}
