import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import { Bot, FileText, PackageOpen, Server, UserRound, Zap } from 'lucide-react'
import type { ApmPackageScope } from '../../../shared/apm-contracts'
import type { DragPrimitive, DropTargetData } from '../../lib/dnd-handlers'
import {
    packageScopeLabel,
    primitiveSummary,
    PRIMITIVE_SYNC_UNITS,
    unitLabel,
} from './target-export-sync-utils'
import { TargetExportSourceRows } from './TargetExportSourceRows'
import type { TargetExportControllerState } from './useTargetExportController'
import type { TargetExportAssetDetailRequest } from './target-export-detail-model'
import { buildTargetExportSourcePrimitiveItems } from './target-export-source-row-model'

interface TargetExportSourceColumnProps {
    controller: TargetExportControllerState
    onOpenDetails: (request: TargetExportAssetDetailRequest) => void
    scope: ApmPackageScope
}

interface TargetExportSourceControlsProps {
    controller: TargetExportControllerState
}

function syncUnitIcon(unit: string) {
    if (unit === 'agents') return <Bot size={10} />
    if (unit === 'instructions') return <FileText size={10} />
    if (unit === 'skills') return <Zap size={10} />
    if (unit === 'prompts' || unit === 'commands') return <FileText size={10} />
    if (unit === 'hooks') return <Zap size={10} />
    if (unit === 'mcp') return <Server size={10} />
    return null
}

function oppositeScope(scope: ApmPackageScope): ApmPackageScope {
    return scope === 'user' ? 'workspace' : 'user'
}

export function TargetExportSourceControls({ controller }: TargetExportSourceControlsProps) {
    const {
        selectSyncUnit,
        selectedSyncUnit,
    } = controller

    return (
        <section className="target-export-controlbar" aria-label="APM source controls">
            <div className="target-export-primitive-tabs" role="tablist" aria-label="APM primitive unit">
                {PRIMITIVE_SYNC_UNITS.map((unit) => (
                    <button
                        key={unit}
                        type="button"
                        className={`target-export-primitive-tab ${selectedSyncUnit === unit ? 'is-active' : ''}`}
                        aria-selected={selectedSyncUnit === unit}
                        role="tab"
                        onClick={() => selectSyncUnit(unit)}
                    >
                        {syncUnitIcon(unit)}
                        {unitLabel(unit)}
                    </button>
                ))}
            </div>
        </section>
    )
}

export function TargetExportSourceColumn({ controller, onOpenDetails, scope }: TargetExportSourceColumnProps) {
    const {
        activeTarget,
        apmPackagesLoading,
        projectCounts,
        projectPackageWarnings,
        projectPackages,
        running,
        selectedSyncUnit,
        stagePackageForActiveTarget,
        stageScopeCopy,
        stagedPackageIds,
        stagedPackageSet,
        stagedScopeCopySet,
        toggleStagedPackage,
        toggleStagedScopeCopy,
        unsyncedPackageIds,
        userCounts,
        userPackageWarnings,
        userPackages,
    } = controller

    const isProject = scope === 'workspace'
    const title = packageScopeLabel(scope)
    const destinationScope = oppositeScope(scope)
    const packages = isProject ? controller.syncableProjectPackages : controller.syncableUserPackages
    const sourceItems = buildTargetExportSourcePrimitiveItems(packages, selectedSyncUnit)
    const allPackages = isProject ? projectPackages : userPackages
    const counts = isProject ? projectCounts : userCounts
    const packageWarnings = isProject ? projectPackageWarnings : userPackageWarnings
    const copyToDestinationCount = controller.stagedScopeCopies
        .filter((copy) => copy.fromScope === scope && copy.toScope === destinationScope)
        .length
    const { isOver, setNodeRef } = useDroppable({
        id: `target-export-scope:${scope}`,
        data: {
            type: 'target-export-scope',
            scope,
        } satisfies DropTargetData,
        disabled: running,
    })

    useDndMonitor({
        onDragEnd(event) {
            const dropData = event.over?.data.current as DropTargetData | undefined
            if (dropData?.type !== 'target-export-scope' || dropData.scope !== scope) return

            const primitive = event.active.data.current as DragPrimitive | undefined
            if (primitive?.kind !== 'apm-package' || !primitive.packageId) return
            const fromScope = primitive.scope || 'workspace'
            if (fromScope === scope) return
            void stageScopeCopy(primitive.packageId, fromScope, scope)
        },
    })

    return (
        <section
            ref={setNodeRef}
            className={`surface-card target-export-source ${isOver ? 'is-over' : ''}`}
            aria-label={`${title} packages`}
        >
            <div className="target-export-section-header">
                <div>
                    <div className="target-export-panel-title">
                        {isProject ? <PackageOpen size={15} /> : <UserRound size={15} />}
                        <h2>{title}</h2>
                    </div>
                </div>
            </div>

            <div className="target-export-source__summary" title={`${allPackages.length} packages · ${primitiveSummary(counts, selectedSyncUnit)}`}>
                {isProject && stagedPackageIds.length > 0 ? <strong>{stagedPackageIds.length} staged</strong> : null}
                {!isProject && copyToDestinationCount > 0 ? <strong>{copyToDestinationCount} copy</strong> : null}
                {isProject && unsyncedPackageIds.length > 0 ? <span>{unsyncedPackageIds.length} unsynced</span> : null}
                {copyToDestinationCount > 0 ? <span>to {packageScopeLabel(destinationScope)}</span> : null}
                {packageWarnings > 0 ? <span>{packageWarnings} warnings</span> : null}
                {stagedPackageIds.length === 0 && copyToDestinationCount === 0 && unsyncedPackageIds.length === 0 && packageWarnings === 0 ? (
                    <span>{sourceItems.length} available</span>
                ) : null}
            </div>

            <TargetExportSourceRows
                items={sourceItems}
                activeTarget={activeTarget}
                allowTargetStage={isProject}
                copyTargetScope={destinationScope}
                copyActionLabel={`Copy to ${packageScopeLabel(destinationScope)}`}
                packageExportStateByPackage={controller.activeTargetPackageExportStateByPackage}
                running={running}
                selectedSyncUnit={selectedSyncUnit}
                onOpenDetails={onOpenDetails}
                stagePackageForActiveTarget={stagePackageForActiveTarget}
                stagedPackageSet={stagedPackageSet}
                stagedScopeCopySet={stagedScopeCopySet}
                toggleStagedPackage={toggleStagedPackage}
                toggleStagedScopeCopy={toggleStagedScopeCopy}
            />

            {sourceItems.length === 0 && !apmPackagesLoading ? (
                <div className="target-export-empty">
                    No {title.toLowerCase()} primitive contains {unitLabel(selectedSyncUnit)}.
                </div>
            ) : null}

        </section>
    )
}
