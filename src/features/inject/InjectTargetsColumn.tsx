import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { InjectTargetRows } from './InjectTargetRows'
import type { InjectControllerState } from './useInjectController'

interface InjectTargetsColumnProps {
    controller: InjectControllerState
}

export function InjectTargetsColumn({ controller }: InjectTargetsColumnProps) {
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
        selectedPackages,
        selectedSyncUnit,
        setPackageSyncChoice,
        syncChoices,
        targetOnlyDefinitions,
        targetStates,
        targets,
        toolingStatusLabel,
    } = controller

    return (
        <aside className="surface-card target-inject-preview" aria-label="Targets">
            <div className="target-inject-section-header">
                <div>
                    <div className="target-inject-panel-title">
                        <CheckCircle2 size={15} />
                        <h2>Targets</h2>
                    </div>
                    <p>{toolingStatusLabel}</p>
                </div>
                <span className="badge badge--subtle">{activeTarget?.label || 'No target'}</span>
            </div>

            <div className="target-inject-target-tabs" role="tablist" aria-label="Sync target">
                {targets.map((target) => {
                    const availability = targetStates.get(target.id) || { available: false, reason: 'Target unavailable.' }
                    return (
                        <button
                            key={target.id}
                            type="button"
                            className={`target-inject-target-tab ${activeTarget?.id === target.id ? 'is-active' : ''}`}
                            aria-selected={activeTarget?.id === target.id}
                            role="tab"
                            disabled={!availability.available}
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
                <>
                    <div className="target-inject-source__summary target-inject-target-summary">
                        <strong>{activePushPackageIds.length} push</strong>
                        <span>{activeTarget.outputHint}</span>
                        <span>{activeTargetDefinitions.length} target definition{activeTargetDefinitions.length === 1 ? '' : 's'}</span>
                    </div>

                    {!activeTargetAvailability?.available ? (
                        <div className="target-inject-blocked target-inject-blocked--panel">
                            <AlertTriangle size={14} />
                            <span>{activeTargetAvailability?.reason}</span>
                        </div>
                    ) : null}

                    <InjectTargetRows
                        activeTarget={activeTarget}
                        activeTargetCurrentByPackage={activeTargetCurrentByPackage}
                        activeTargetDefinitionByPackage={activeTargetDefinitionByPackage}
                        activeTargetResultByPackage={activeTargetResultByPackage}
                        running={running}
                        selectedPackages={selectedPackages}
                        selectedSyncUnit={selectedSyncUnit}
                        setPackageSyncChoice={setPackageSyncChoice}
                        syncChoices={syncChoices}
                        targetOnlyDefinitions={targetOnlyDefinitions}
                    />

                    {selectedPackages.length === 0 && targetOnlyDefinitions.length === 0 ? (
                        <div className="target-inject-empty">
                            Select source packages to preview this target.
                        </div>
                    ) : null}

                    {activeTargetAvailability?.available ? (
                        <ol className="target-inject-sync-steps target-inject-sync-plan">
                            {activeTargetPlanSteps.map((step) => <li key={step}>{step}</li>)}
                        </ol>
                    ) : null}
                </>
            ) : (
                <div className="target-inject-empty">
                    Select a target to preview sync.
                </div>
            )}
        </aside>
    )
}
