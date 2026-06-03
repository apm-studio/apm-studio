import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import type { DragPrimitive, DropTargetData } from '../../lib/dnd-handlers'
import { TargetExportTargetLogo } from './TargetExportTargetLogo'
import { TargetExportTargetRows } from './TargetExportTargetRows'
import type { TargetExportControllerState } from './useTargetExportController'
import type { TargetExportAssetDetailRequest } from './target-export-detail-model'
import { targetOutputHint } from './target-export-sync-utils'

interface TargetExportTargetsColumnProps {
    controller: TargetExportControllerState
    onOpenDetails: (request: TargetExportAssetDetailRequest) => void
}

export function TargetExportTargetsColumn({ controller, onOpenDetails }: TargetExportTargetsColumnProps) {
    const {
        activeSavePackageIds,
        activeTarget,
        activeTargetAvailability,
        activeTargetCurrentByPackage,
        activeTargetCurrentPackages,
        activeTargetDefinitionByPackage,
        activeTargetDefinitions,
        activeTargetPlanSteps,
        activeTargetResultByPackage,
        importTargetDefinition,
        importingTargetDefinitionIds,
        running,
        selectTarget,
        selectedSyncUnit,
        setPackageExportChoice,
        stagePackageForActiveTarget,
        stagedPackages,
        exportChoices,
        targetOnlyDefinitions,
        targetMessage,
        targetStates,
        targets,
    } = controller
    const droppableId = activeTarget ? `target-export-target:${activeTarget.id}` : 'target-export-target:none'
    const visibleTargetMessage = targetMessage && targetMessage !== activeTargetAvailability?.reason
        ? targetMessage
        : null
    const activeTargetOutputHint = activeTarget && activeTargetAvailability?.available
        ? targetOutputHint(activeTarget, selectedSyncUnit)
        : 'Unsupported'
    const { isOver, setNodeRef } = useDroppable({
        id: droppableId,
        data: {
            type: 'target-export-target',
            targetId: activeTarget?.id || null,
        } satisfies DropTargetData,
        disabled: !activeTarget || running,
    })

    useDndMonitor({
        onDragEnd(event) {
            const dropData = event.over?.data.current as DropTargetData | undefined
            if (dropData?.type !== 'target-export-target') return

            const primitive = event.active.data.current as DragPrimitive | undefined
            if (primitive?.kind !== 'apm-package' || !primitive.packageId) {
                return
            }
            void stagePackageForActiveTarget(primitive.packageId, primitive.syncUnit || selectedSyncUnit)
        },
    })

    return (
        <aside className="surface-card target-export-preview" aria-label="Targets">
            <div className="target-export-section-header">
                <div>
                    <div className="target-export-panel-title">
                        <CheckCircle2 size={15} />
                        <h2>Targets</h2>
                    </div>
                </div>
            </div>

            <div className="target-export-target-tabs" role="tablist" aria-label="Export target">
                {targets.map((target) => {
                    const availability = targetStates.get(target.id) || { available: false, reason: 'Target unavailable.' }
                    const outputHint = targetOutputHint(target, selectedSyncUnit)
                    return (
                        <button
                            key={target.id}
                            type="button"
                            className={`target-export-target-tab ${activeTarget?.id === target.id ? 'is-active' : ''}`}
                            aria-selected={activeTarget?.id === target.id}
                            role="tab"
                            disabled={!target.available}
                            title={availability.reason || `${target.label} ${selectedSyncUnit}: ${outputHint}`}
                            onClick={() => selectTarget(target.id)}
                        >
                            <span className="target-export-target-tab__main">
                                <TargetExportTargetLogo targetId={target.id} label={target.label} />
                                <strong>{target.label}</strong>
                            </span>
                            <span className="target-export-target-tab__hint">
                                {availability.available ? outputHint : 'Unsupported'}
                            </span>
                        </button>
                    )
                })}
            </div>

            {activeTarget ? (
                <div
                    ref={setNodeRef}
                    className={`target-export-target-panel ${isOver ? 'is-over' : ''} ${!activeTargetAvailability?.available ? 'is-blocked' : ''}`}
                >
                    <div
                        className="target-export-source__summary target-export-target-summary"
                        title={`${activeTargetOutputHint} · ${activeTargetDefinitions.length} target definition${activeTargetDefinitions.length === 1 ? '' : 's'}`}
                    >
                        {activeSavePackageIds.length > 0 ? <strong>{activeSavePackageIds.length} save</strong> : null}
                        <span>{activeTargetOutputHint}</span>
                        {activeTargetCurrentPackages.length > 0 ? <span>{activeTargetCurrentPackages.length} current</span> : null}
                        {activeSavePackageIds.length === 0 ? <span>Nothing staged</span> : null}
                    </div>

                    {visibleTargetMessage ? (
                        <div className="target-export-drop-message">
                            {visibleTargetMessage}
                        </div>
                    ) : null}

                    {!activeTargetAvailability?.available ? (
                        <div className="target-export-blocked target-export-blocked--panel">
                            <AlertTriangle size={14} />
                            <span>{activeTargetAvailability?.reason}</span>
                        </div>
                    ) : null}

                    <TargetExportTargetRows
                        activeTarget={activeTarget}
                        activeTargetCurrentByPackage={activeTargetCurrentByPackage}
                        activeTargetCurrentPackages={activeTargetCurrentPackages}
                        activeTargetDefinitionByPackage={activeTargetDefinitionByPackage}
                        activeTargetResultByPackage={activeTargetResultByPackage}
                        importTargetDefinition={importTargetDefinition}
                        importingTargetDefinitionIds={importingTargetDefinitionIds}
                        running={running}
                        selectedSyncUnit={selectedSyncUnit}
                        setPackageExportChoice={setPackageExportChoice}
                        onOpenDetails={onOpenDetails}
                        stagedPackages={stagedPackages}
                        exportChoices={exportChoices}
                        targetOnlyDefinitions={targetOnlyDefinitions}
                    />

                    {stagedPackages.length === 0 && activeTargetCurrentPackages.length === 0 && targetOnlyDefinitions.length === 0 ? (
                        <div className="target-export-empty">
                            Drop source cards here or use Add to target.
                        </div>
                    ) : null}

                    {activeTargetAvailability?.available && activeTargetPlanSteps.length > 0 ? (
                        <details className="target-export-save-plan-details">
                            <summary>{activeTargetPlanSteps.length} save step{activeTargetPlanSteps.length === 1 ? '' : 's'}</summary>
                            <ol className="target-export-save-steps target-export-save-plan">
                                {activeTargetPlanSteps.map((step) => <li key={step}>{step}</li>)}
                            </ol>
                        </details>
                    ) : null}
                </div>
            ) : (
                <div className="target-export-empty">
                    Select a target to preview export.
                </div>
            )}
        </aside>
    )
}
