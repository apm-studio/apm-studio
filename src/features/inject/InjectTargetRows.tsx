import { PackageOpen } from 'lucide-react'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import type { ApmSyncTargetDefinitionSummary } from '../../../shared/apm-sync-contracts'
import { InjectPackageIcon } from './InjectPackageIcon'
import {
    buildInjectTargetOnlyDefinitionRowModel,
    buildInjectTargetPackageRowModel,
} from './inject-target-row-model'
import type { InjectControllerState } from './useInjectController'
import type { TargetSyncChoice } from './inject-sync-utils'

interface InjectTargetRowsProps {
    activeTarget: NonNullable<InjectControllerState['activeTarget']>
    activeTargetCurrentByPackage: InjectControllerState['activeTargetCurrentByPackage']
    activeTargetDefinitionByPackage: InjectControllerState['activeTargetDefinitionByPackage']
    activeTargetResultByPackage: InjectControllerState['activeTargetResultByPackage']
    running: boolean
    selectedPackages: ApmPackageSummary[]
    selectedSyncUnit: InjectControllerState['selectedSyncUnit']
    setPackageSyncChoice: (packageId: string, choice: TargetSyncChoice) => void
    syncChoices: InjectControllerState['syncChoices']
    targetOnlyDefinitions: ApmSyncTargetDefinitionSummary[]
}

export function InjectTargetRows({
    activeTarget,
    activeTargetCurrentByPackage,
    activeTargetDefinitionByPackage,
    activeTargetResultByPackage,
    running,
    selectedPackages,
    selectedSyncUnit,
    setPackageSyncChoice,
    syncChoices,
    targetOnlyDefinitions,
}: InjectTargetRowsProps) {
    return (
        <div className="target-inject-selected-list target-inject-target-list">
            {selectedPackages.map((pkg) => {
                const row = buildInjectTargetPackageRowModel({
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
                        className="target-inject-selected-chip target-inject-target-item"
                        title={row.detail}
                    >
                        <span className="target-inject-selected-chip__title">
                            <InjectPackageIcon pkg={pkg} syncUnit={selectedSyncUnit} />
                            <strong>{row.packageName}</strong>
                            <span className={`target-inject-state-pill ${row.stateClass}`}>
                                {row.status}
                            </span>
                        </span>
                        <span>
                            {row.badges.map((badge) => (
                                <span key={badge} className="badge badge--subtle">{badge}</span>
                            ))}
                        </span>
                        <small>{row.detail}</small>
                        <span className="target-inject-sync-choice" aria-label={`${row.packageName} sync action`}>
                            <button
                                type="button"
                                className={`target-inject-choice-btn ${row.syncChoice === 'push' ? 'is-active' : ''}`}
                                onClick={() => setPackageSyncChoice(row.packageId, 'push')}
                                disabled={!row.availability.available || running}
                            >
                                Push
                            </button>
                            <button
                                type="button"
                                className={`target-inject-choice-btn ${row.syncChoice === 'skip' ? 'is-active' : ''}`}
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
                const row = buildInjectTargetOnlyDefinitionRowModel(definition)
                return (
                    <article
                        key={row.id}
                        className="target-inject-selected-chip target-inject-target-item"
                        title={row.detail}
                    >
                        <span className="target-inject-selected-chip__title">
                            <PackageOpen size={12} className="primitive-icon combo" />
                            <strong>{row.name}</strong>
                            <span className={`target-inject-state-pill ${row.stateClass}`}>
                                {row.status}
                            </span>
                        </span>
                        <span>
                            {row.badges.map((badge) => (
                                <span key={badge} className="badge badge--subtle">{badge}</span>
                            ))}
                        </span>
                        <small>{row.detail}</small>
                        <span className="target-inject-sync-choice">
                            <button type="button" className="target-inject-choice-btn is-active" disabled>
                                Keep
                            </button>
                        </span>
                    </article>
                )
            })}
        </div>
    )
}
