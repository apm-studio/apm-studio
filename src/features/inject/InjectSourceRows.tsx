import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import { InjectPackageIcon } from './InjectPackageIcon'
import { buildInjectSourcePackageRowModel } from './inject-source-row-model'
import type { InjectControllerState } from './useInjectController'

interface InjectSourceRowsProps {
    packages: ApmPackageSummary[]
    running: boolean
    selectedPackageSet: InjectControllerState['selectedPackageSet']
    selectedSyncUnit: InjectControllerState['selectedSyncUnit']
    togglePackage: InjectControllerState['togglePackage']
}

export function InjectSourceRows({
    packages,
    running,
    selectedPackageSet,
    selectedSyncUnit,
    togglePackage,
}: InjectSourceRowsProps) {
    return (
        <div className="target-inject-selected-list">
            {packages.map((pkg) => {
                const row = buildInjectSourcePackageRowModel({
                    pkg,
                    selected: selectedPackageSet.has(pkg.packageId),
                    syncUnit: selectedSyncUnit,
                })
                return (
                    <button
                        key={row.packageId}
                        type="button"
                        className={`target-inject-selected-chip ${row.selected ? 'is-selected' : ''}`}
                        title={row.detail}
                        onClick={() => togglePackage(row.packageId)}
                        disabled={running}
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
                    </button>
                )
            })}
        </div>
    )
}
