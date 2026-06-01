import { PackageOpen } from 'lucide-react'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import type { ApmSyncTargetDefinitionSummary } from '../../../shared/apm-sync-contracts'
import { TargetExportPackageIcon } from './TargetExportPackageIcon'
import {
    buildTargetExportTargetOnlyDefinitionRowModel,
    buildTargetExportTargetPackageRowModel,
} from './target-export-target-row-model'
import type { TargetExportControllerState } from './useTargetExportController'
import type { TargetExportChoice } from './target-export-sync-utils'

interface TargetExportTargetRowsProps {
    activeTarget: NonNullable<TargetExportControllerState['activeTarget']>
    activeTargetCurrentByPackage: TargetExportControllerState['activeTargetCurrentByPackage']
    activeTargetDefinitionByPackage: TargetExportControllerState['activeTargetDefinitionByPackage']
    activeTargetResultByPackage: TargetExportControllerState['activeTargetResultByPackage']
    running: boolean
    selectedSyncUnit: TargetExportControllerState['selectedSyncUnit']
    setPackageExportChoice: (packageId: string, choice: TargetExportChoice) => void
    stagedPackages: ApmPackageSummary[]
    exportChoices: TargetExportControllerState['exportChoices']
    targetOnlyDefinitions: ApmSyncTargetDefinitionSummary[]
}

export function TargetExportTargetRows({
    activeTarget,
    activeTargetCurrentByPackage,
    activeTargetDefinitionByPackage,
    activeTargetResultByPackage,
    running,
    selectedSyncUnit,
    setPackageExportChoice,
    stagedPackages,
    exportChoices,
    targetOnlyDefinitions,
}: TargetExportTargetRowsProps) {
    return (
        <div className="target-export-selected-list target-export-target-list">
            {stagedPackages.map((pkg) => {
                const row = buildTargetExportTargetPackageRowModel({
                    currentItem: activeTargetCurrentByPackage.get(pkg.packageId),
                    definition: activeTargetDefinitionByPackage.get(pkg.packageId),
                    pkg,
                    result: activeTargetResultByPackage.get(pkg.packageId),
                    exportChoice: exportChoices[`${activeTarget.id}:${pkg.packageId}`] || 'save',
                    syncUnit: selectedSyncUnit,
                    target: activeTarget,
                })

                return (
                    <article
                        key={`${activeTarget.id}:${row.packageId}`}
                        className="target-export-selected-chip target-export-target-item"
                        title={row.detail}
                    >
                        <span className="target-export-selected-chip__title">
                            <TargetExportPackageIcon pkg={pkg} syncUnit={selectedSyncUnit} />
                            <strong>{row.packageName}</strong>
                            <span className={`target-export-state-pill ${row.stateClass}`}>
                                {row.status}
                            </span>
                        </span>
                        <span>
                            {row.badges.map((badge) => (
                                <span key={badge} className="badge badge--subtle">{badge}</span>
                            ))}
                        </span>
                        <small>{row.detail}</small>
                        <span className="target-export-action-choice" aria-label={`${row.packageName} export action`}>
                            <button
                                type="button"
                                className={`target-export-choice-btn ${row.exportChoice === 'save' ? 'is-active' : ''}`}
                                onClick={() => setPackageExportChoice(row.packageId, 'save')}
                                disabled={!row.availability.available || running}
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                className={`target-export-choice-btn ${row.exportChoice === 'skip' ? 'is-active' : ''}`}
                                onClick={() => setPackageExportChoice(row.packageId, 'skip')}
                                disabled={running}
                            >
                                Skip
                            </button>
                        </span>
                    </article>
                )
            })}
            {targetOnlyDefinitions.map((definition) => {
                const row = buildTargetExportTargetOnlyDefinitionRowModel(definition)
                return (
                    <article
                        key={row.id}
                        className="target-export-selected-chip target-export-target-item"
                        title={row.detail}
                    >
                        <span className="target-export-selected-chip__title">
                            <PackageOpen size={12} className="primitive-icon combo" />
                            <strong>{row.name}</strong>
                            <span className={`target-export-state-pill ${row.stateClass}`}>
                                {row.status}
                            </span>
                        </span>
                        <span>
                            {row.badges.map((badge) => (
                                <span key={badge} className="badge badge--subtle">{badge}</span>
                            ))}
                        </span>
                        <small>{row.detail}</small>
                        <span className="target-export-action-choice">
                            <button type="button" className="target-export-choice-btn is-active" disabled>
                                Keep
                            </button>
                        </span>
                    </article>
                )
            })}
        </div>
    )
}
