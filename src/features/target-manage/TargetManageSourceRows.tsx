import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Bot, Boxes, FileText, GripVertical, PackageOpen, Server, Zap } from 'lucide-react'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import type { ApmSyncTargetSummary } from '../../../shared/apm-sync-contracts'
import {
    buildTargetManagePackageDragPayload,
    buildTargetManageSourcePackageRowModel,
} from './target-manage-source-row-model'
import {
    targetPackageAvailability,
    unitLabel,
} from './target-manage-sync-utils'
import type { TargetManageControllerState } from './useTargetManageController'

interface TargetManageSourceRowsProps {
    activeTarget: ApmSyncTargetSummary | null
    packageSyncStateByPackage: TargetManageControllerState['activeTargetPackageSyncStateByPackage']
    packages: ApmPackageSummary[]
    running: boolean
    stagePackageForActiveTarget: TargetManageControllerState['stagePackageForActiveTarget']
    stagedPackageSet: TargetManageControllerState['stagedPackageSet']
    selectedSyncUnit: TargetManageControllerState['selectedSyncUnit']
    toggleStagedPackage: TargetManageControllerState['toggleStagedPackage']
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

function packagePath(pkg: ApmPackageSummary) {
    return pkg.microsoftApm?.packageRoot || pkg.manifestPath || 'package root unavailable'
}

function TargetManageSourceCard({
    activeTarget,
    packageSyncStateByPackage,
    pkg,
    running,
    stagePackageForActiveTarget,
    staged,
    selectedSyncUnit,
    toggleStagedPackage,
}: {
    activeTarget: ApmSyncTargetSummary | null
    packageSyncStateByPackage: TargetManageControllerState['activeTargetPackageSyncStateByPackage']
    pkg: ApmPackageSummary
    running: boolean
    stagePackageForActiveTarget: TargetManageControllerState['stagePackageForActiveTarget']
    staged: boolean
    selectedSyncUnit: TargetManageControllerState['selectedSyncUnit']
    toggleStagedPackage: TargetManageControllerState['toggleStagedPackage']
}) {
    const row = buildTargetManageSourcePackageRowModel({
        pkg,
        staged,
        syncUnit: selectedSyncUnit,
        targetState: packageSyncStateByPackage.get(pkg.packageId),
    })
    const availability = activeTarget
        ? targetPackageAvailability(activeTarget, selectedSyncUnit, pkg)
        : { available: false, reason: 'Select a target first.' }
    const dragPayload = useMemo(() => (
        buildTargetManagePackageDragPayload(pkg, selectedSyncUnit)
    ), [pkg, selectedSyncUnit])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `target-manage-source-${selectedSyncUnit}-${pkg.packageId}`,
        data: dragPayload,
        disabled: running,
    })
    const title = availability.reason
        || `Drag to ${activeTarget?.label || 'target'} or add ${unitLabel(selectedSyncUnit)}.`

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`primitive-card package-summary-card target-manage-source-card ${row.stateClass} ${isDragging ? 'is-dragging' : ''} ${staged ? 'is-selected' : ''}`}
            title={title}
        >
            <div className="primitive-card__header">
                <GripVertical size={10} className="drag-handle" />
                {packageIcon(pkg.kind)}
                <span className="primitive-card__name" title={row.packageName}>{row.packageName}</span>
                <span className={`primitive-sync-badge target-manage-source-card__status ${row.stateClass}`}>
                    {row.status}
                </span>
            </div>
            <div className="primitive-card__author" title={`${unitLabel(selectedSyncUnit)} · ${pkg.packageId}`}>
                {unitLabel(selectedSyncUnit)} · {pkg.packageId}
            </div>
            <div className="primitive-card__desc" title={row.detail}>
                {row.detail}
            </div>
            <div className="package-summary-card__primitive-map" aria-label={`${row.packageName} primitives`}>
                {row.badges.map((badge) => (
                    <span key={badge} className="package-summary-card__primitive-chip">
                        {badge}
                    </span>
                ))}
            </div>
            <div className="target-manage-source-card__footer">
                <div className="package-summary-card__path" title={packagePath(pkg)}>
                    <Boxes size={10} />
                    <span>{packagePath(pkg)}</span>
                </div>
                <button
                    type="button"
                    className="btn btn--sm target-manage-source-card__action"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation()
                        if (staged) {
                            toggleStagedPackage(row.packageId)
                            return
                        }
                        void stagePackageForActiveTarget(row.packageId, selectedSyncUnit)
                    }}
                    disabled={running}
                    title={availability.reason || 'Stage for the selected target'}
                >
                    {staged ? 'Remove' : 'Add to target'}
                </button>
            </div>
        </div>
    )
}

export function TargetManageSourceRows({
    activeTarget,
    packageSyncStateByPackage,
    packages,
    running,
    stagePackageForActiveTarget,
    stagedPackageSet,
    selectedSyncUnit,
    toggleStagedPackage,
}: TargetManageSourceRowsProps) {
    return (
        <div className="target-manage-source-card-list">
            {packages.map((pkg) => (
                <TargetManageSourceCard
                    key={pkg.packageId}
                    activeTarget={activeTarget}
                    packageSyncStateByPackage={packageSyncStateByPackage}
                    pkg={pkg}
                    running={running}
                    stagePackageForActiveTarget={stagePackageForActiveTarget}
                    staged={stagedPackageSet.has(pkg.packageId)}
                    selectedSyncUnit={selectedSyncUnit}
                    toggleStagedPackage={toggleStagedPackage}
                />
            ))}
        </div>
    )
}
