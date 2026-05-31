import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import type { DragPrimitive, DropTargetData } from '../../lib/dnd-handlers'
import { TargetManageTargetRows } from './TargetManageTargetRows'
import type { TargetManageControllerState } from './useTargetManageController'

interface TargetManageTargetsColumnProps {
    controller: TargetManageControllerState
}

export function TargetManageTargetsColumn({ controller }: TargetManageTargetsColumnProps) {
    const {
        activePushPackageIds,
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
        setPackageSyncChoice,
        stagePackageForActiveTarget,
        stagedPackages,
        syncChoices,
        targetOnlyDefinitions,
        targetMessage,
        targetStates,
        targets,
    } = controller
    const droppableId = activeTarget ? `target-manage-target:${activeTarget.id}` : 'target-manage-target:none'
    const visibleTargetMessage = targetMessage && targetMessage !== activeTargetAvailability?.reason
        ? targetMessage
        : null
    const { isOver, setNodeRef } = useDroppable({
        id: droppableId,
        data: {
            type: 'target-manage-target',
            targetId: activeTarget?.id || null,
        } satisfies DropTargetData,
        disabled: !activeTarget || running,
    })

    useDndMonitor({
        onDragEnd(event) {
            const dropData = event.over?.data.current as DropTargetData | undefined
            if (dropData?.type !== 'target-manage-target') return

            const primitive = event.active.data.current as DragPrimitive | undefined
            if (primitive?.kind !== 'apm-package' || !primitive.packageId) {
                return
            }
            void stagePackageForActiveTarget(primitive.packageId, primitive.syncUnit || selectedSyncUnit)
        },
    })

    return (
        <aside className="surface-card target-manage-preview" aria-label="Targets">
            <div className="target-manage-section-header">
                <div>
                    <div className="target-manage-panel-title">
                        <CheckCircle2 size={15} />
                        <h2>Targets</h2>
                    </div>
                </div>
            </div>

            <div className="target-manage-target-tabs" role="tablist" aria-label="Sync target">
                {targets.map((target) => {
                    const availability = targetStates.get(target.id) || { available: false, reason: 'Target unavailable.' }
                    return (
                        <button
                            key={target.id}
                            type="button"
                            className={`target-manage-target-tab ${activeTarget?.id === target.id ? 'is-active' : ''}`}
                            aria-selected={activeTarget?.id === target.id}
                            role="tab"
                            disabled={!target.available}
                            title={availability.reason || target.description}
                            onClick={() => selectTarget(target.id)}
                        >
                            <strong>{target.label}</strong>
                            <span>{availability.available ? target.outputHint : 'Unsupported'}</span>
                        </button>
                    )
                })}
            </div>

            {activeTarget ? (
                <div
                    ref={setNodeRef}
                    className={`target-manage-target-panel ${isOver ? 'is-over' : ''} ${!activeTargetAvailability?.available ? 'is-blocked' : ''}`}
                >
                    <div className="target-manage-source__summary target-manage-target-summary">
                        <strong>{activePushPackageIds.length} push</strong>
                        <span>{activeTarget.outputHint}</span>
                        <span>{activeTargetDefinitions.length} target definition{activeTargetDefinitions.length === 1 ? '' : 's'}</span>
                    </div>

                    {visibleTargetMessage ? (
                        <div className="target-manage-drop-message">
                            {visibleTargetMessage}
                        </div>
                    ) : null}

                    {!activeTargetAvailability?.available ? (
                        <div className="target-manage-blocked target-manage-blocked--panel">
                            <AlertTriangle size={14} />
                            <span>{activeTargetAvailability?.reason}</span>
                        </div>
                    ) : null}

                    <TargetManageTargetRows
                        activeTarget={activeTarget}
                        activeTargetCurrentByPackage={activeTargetCurrentByPackage}
                        activeTargetDefinitionByPackage={activeTargetDefinitionByPackage}
                        activeTargetResultByPackage={activeTargetResultByPackage}
                        running={running}
                        selectedSyncUnit={selectedSyncUnit}
                        setPackageSyncChoice={setPackageSyncChoice}
                        stagedPackages={stagedPackages}
                        syncChoices={syncChoices}
                        targetOnlyDefinitions={targetOnlyDefinitions}
                    />

                    {stagedPackages.length === 0 && targetOnlyDefinitions.length === 0 ? (
                        <div className="target-manage-empty">
                            Drop source cards here or use Add to target.
                        </div>
                    ) : null}

                    {activeTargetAvailability?.available ? (
                        <ol className="target-manage-sync-steps target-manage-sync-plan">
                            {activeTargetPlanSteps.map((step) => <li key={step}>{step}</li>)}
                        </ol>
                    ) : null}
                </div>
            ) : (
                <div className="target-manage-empty">
                    Select a target to preview sync.
                </div>
            )}
        </aside>
    )
}
