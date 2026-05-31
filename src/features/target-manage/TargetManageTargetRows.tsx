import { PackageOpen } from 'lucide-react'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import type { ApmSyncTargetDefinitionSummary } from '../../../shared/apm-sync-contracts'
import { TargetManagePackageIcon } from './TargetManagePackageIcon'
import {
    buildTargetManageTargetOnlyDefinitionRowModel,
    buildTargetManageTargetPackageRowModel,
} from './target-manage-target-row-model'
import type { TargetManageControllerState } from './useTargetManageController'
import type { TargetSyncChoice } from './target-manage-sync-utils'

interface TargetManageTargetRowsProps {
    activeTarget: NonNullable<TargetManageControllerState['activeTarget']>
    activeTargetCurrentByPackage: TargetManageControllerState['activeTargetCurrentByPackage']
    activeTargetDefinitionByPackage: TargetManageControllerState['activeTargetDefinitionByPackage']
    activeTargetResultByPackage: TargetManageControllerState['activeTargetResultByPackage']
    running: boolean
    selectedSyncUnit: TargetManageControllerState['selectedSyncUnit']
    setPackageSyncChoice: (packageId: string, choice: TargetSyncChoice) => void
    stagedPackages: ApmPackageSummary[]
    syncChoices: TargetManageControllerState['syncChoices']
    targetOnlyDefinitions: ApmSyncTargetDefinitionSummary[]
}

export function TargetManageTargetRows({
    activeTarget,
    activeTargetCurrentByPackage,
    activeTargetDefinitionByPackage,
    activeTargetResultByPackage,
    running,
    selectedSyncUnit,
    setPackageSyncChoice,
    stagedPackages,
    syncChoices,
    targetOnlyDefinitions,
}: TargetManageTargetRowsProps) {
    return (
        <div className="target-manage-selected-list target-manage-target-list">
            {stagedPackages.map((pkg) => {
                const row = buildTargetManageTargetPackageRowModel({
                    currentItem: activeTargetCurrentByPackage.get(pkg.packageId),
                    definition: activeTargetDefinitionByPackage.get(pkg.packageId),
                    pkg,
                    result: activeTargetResultByPackage.get(pkg.packageId),
                    syncChoice: syncChoices[`${activeTarget.id}:${pkg.packageId}`] || 'push',
                    syncUnit: selectedSyncUnit,
                    target: activeTarget,
                })

                return (
                    <article
                        key={`${activeTarget.id}:${row.packageId}`}
                        className="target-manage-selected-chip target-manage-target-item"
                        title={row.detail}
                    >
                        <span className="target-manage-selected-chip__title">
                            <TargetManagePackageIcon pkg={pkg} syncUnit={selectedSyncUnit} />
                            <strong>{row.packageName}</strong>
                            <span className={`target-manage-state-pill ${row.stateClass}`}>
                                {row.status}
                            </span>
                        </span>
                        <span>
                            {row.badges.map((badge) => (
                                <span key={badge} className="badge badge--subtle">{badge}</span>
                            ))}
                        </span>
                        <small>{row.detail}</small>
                        <span className="target-manage-sync-choice" aria-label={`${row.packageName} sync action`}>
                            <button
                                type="button"
                                className={`target-manage-choice-btn ${row.syncChoice === 'push' ? 'is-active' : ''}`}
                                onClick={() => setPackageSyncChoice(row.packageId, 'push')}
                                disabled={!row.availability.available || running}
                            >
                                Push
                            </button>
                            <button
                                type="button"
                                className={`target-manage-choice-btn ${row.syncChoice === 'skip' ? 'is-active' : ''}`}
                                onClick={() => setPackageSyncChoice(row.packageId, 'skip')}
                                disabled={running}
                            >
                                Skip
                            </button>
                        </span>
                    </article>
                )
            })}
            {targetOnlyDefinitions.map((definition) => {
                const row = buildTargetManageTargetOnlyDefinitionRowModel(definition)
                return (
                    <article
                        key={row.id}
                        className="target-manage-selected-chip target-manage-target-item"
                        title={row.detail}
                    >
                        <span className="target-manage-selected-chip__title">
                            <PackageOpen size={12} className="primitive-icon combo" />
                            <strong>{row.name}</strong>
                            <span className={`target-manage-state-pill ${row.stateClass}`}>
                                {row.status}
                            </span>
                        </span>
                        <span>
                            {row.badges.map((badge) => (
                                <span key={badge} className="badge badge--subtle">{badge}</span>
                            ))}
                        </span>
                        <small>{row.detail}</small>
                        <span className="target-manage-sync-choice">
                            <button type="button" className="target-manage-choice-btn is-active" disabled>
                                Keep
                            </button>
                        </span>
                    </article>
                )
            })}
        </div>
    )
}
