import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import type { DragPrimitive, DropTargetData } from '../../lib/dnd-handlers'
import { useStudioStore } from '../../store'
import { TargetExportTargetLogo } from './TargetExportTargetLogo'
import { TargetExportTargetRows } from './TargetExportTargetRows'
import type { TargetExportControllerState } from './useTargetExportController'

interface TargetExportTargetsColumnProps {
    controller: TargetExportControllerState
}

export function TargetExportTargetsColumn({ controller }: TargetExportTargetsColumnProps) {
    const apmPackageScope = useStudioStore((state) => state.apmPackageScope)
    const {
        activeSavePackageIds,
        activeTarget,
        activeTargetAvailability,
        activeTargetCurrentByPackage,
        activeTargetDefinitionByPackage,
        activeTargetDefinitions,
        activeTargetPlanSteps,
        activeTargetResultByPackage,
        running,
        selectTarget,
        selectedSyncUnit,
        setPackageExportChoice,
        stagePackageForActiveTarget,
        stagedPackages,
        stagedScopeCopies,
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
                    return (
                        <button
                            key={target.id}
                            type="button"
                            className={`target-export-target-tab ${activeTarget?.id === target.id ? 'is-active' : ''}`}
                            aria-selected={activeTarget?.id === target.id}
                            role="tab"
                            disabled={!target.available}
                            title={availability.reason || target.description}
                            onClick={() => selectTarget(target.id)}
                        >
                            <span className="target-export-target-tab__main">
                                <TargetExportTargetLogo targetId={target.id} label={target.label} />
                                <strong>{target.label}</strong>
                            </span>
                            <span className="target-export-target-tab__hint">
                                {availability.available ? target.outputHint : 'Unsupported'}
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
                    <div className="target-export-source__summary target-export-target-summary">
                        <strong>{activeSavePackageIds.length} save</strong>
                        <span>{activeTarget.outputHint}</span>
                        <span>{activeTargetDefinitions.length} target definition{activeTargetDefinitions.length === 1 ? '' : 's'}</span>
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
                        activeTargetDefinitionByPackage={activeTargetDefinitionByPackage}
                        activeTargetResultByPackage={activeTargetResultByPackage}
                        running={running}
                        selectedSyncUnit={selectedSyncUnit}
                        setPackageExportChoice={setPackageExportChoice}
                        stagedPackages={stagedPackages}
                        exportChoices={exportChoices}
                        targetOnlyDefinitions={targetOnlyDefinitions}
                    />

                    {stagedPackages.length === 0 && targetOnlyDefinitions.length === 0 && stagedScopeCopies.length === 0 ? (
                        <div className="target-export-empty">
                            {apmPackageScope === 'user'
                                ? 'Copy User packages to Workspace before target export.'
                                : 'Drop source cards here or use Add to target.'}
                        </div>
                    ) : null}

                    {activeTargetAvailability?.available ? (
                        <ol className="target-export-save-steps target-export-save-plan">
                            {activeTargetPlanSteps.map((step) => <li key={step}>{step}</li>)}
                        </ol>
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
