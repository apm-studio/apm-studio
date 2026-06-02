import { FileSearch, PackageOpen } from 'lucide-react'
import type { ApmSyncTargetDefinitionSummary } from '../../../shared/apm-sync-contracts'
import { TargetExportPackageIcon } from './TargetExportPackageIcon'
import {
    buildTargetExportTargetOnlyDefinitionRowModel,
    buildTargetExportTargetPackageRowModel,
} from './target-export-target-row-model'
import { buildTargetExportSourcePrimitiveItems } from './target-export-source-row-model'
import type { TargetExportControllerState } from './useTargetExportController'
import type { TargetExportChoice, TargetExportScopedPackage } from './target-export-sync-utils'
import type { TargetExportAssetDetailRequest } from './target-export-detail-model'

interface TargetExportTargetRowsProps {
    activeTarget: NonNullable<TargetExportControllerState['activeTarget']>
    activeTargetCurrentByPackage: TargetExportControllerState['activeTargetCurrentByPackage']
    activeTargetCurrentPackages: TargetExportControllerState['activeTargetCurrentPackages']
    activeTargetDefinitionByPackage: TargetExportControllerState['activeTargetDefinitionByPackage']
    activeTargetResultByPackage: TargetExportControllerState['activeTargetResultByPackage']
    running: boolean
    selectedSyncUnit: TargetExportControllerState['selectedSyncUnit']
    setPackageExportChoice: (packageId: string, choice: TargetExportChoice) => void
    onOpenDetails: (request: TargetExportAssetDetailRequest) => void
    stagedPackages: TargetExportScopedPackage[]
    exportChoices: TargetExportControllerState['exportChoices']
    targetOnlyDefinitions: ApmSyncTargetDefinitionSummary[]
}

export function TargetExportTargetRows({
    activeTarget,
    activeTargetCurrentByPackage,
    activeTargetCurrentPackages,
    activeTargetDefinitionByPackage,
    activeTargetResultByPackage,
    running,
    selectedSyncUnit,
    setPackageExportChoice,
    onOpenDetails,
    stagedPackages,
    exportChoices,
    targetOnlyDefinitions,
}: TargetExportTargetRowsProps) {
    const stagedItems = buildTargetExportSourcePrimitiveItems(stagedPackages, selectedSyncUnit)
    const currentItems = buildTargetExportSourcePrimitiveItems(activeTargetCurrentPackages, selectedSyncUnit)

    return (
        <div className="target-export-selected-list target-export-target-list">
            {[
                ...stagedItems.map((item) => ({ item, staged: true })),
                ...currentItems.map((item) => ({ item, staged: false })),
            ].map(({ item, staged }) => {
                const pkg = item.pkg
                const currentItem = activeTargetCurrentByPackage.get(pkg.packageId)
                const definition = activeTargetDefinitionByPackage.get(pkg.packageId)
                const result = activeTargetResultByPackage.get(pkg.packageId)
                const exportChoice = exportChoices[`${activeTarget.id}:${pkg.packageId}`] || 'save'
                const row = buildTargetExportTargetPackageRowModel({
                    currentItem,
                    definition,
                    pkg,
                    result,
                    exportChoice,
                    staged,
                    syncUnit: selectedSyncUnit,
                    target: activeTarget,
                })
                const detailRow = {
                    ...row,
                    detail: item.primitivePath || row.detail,
                    packageName: item.primitiveName,
                }

                return (
                    <article
                        key={`${activeTarget.id}:${staged ? 'staged' : 'current'}:${item.id}`}
                        className="target-export-selected-chip target-export-target-item"
                        title={detailRow.detail}
                    >
                        <span className="target-export-selected-chip__title">
                            <TargetExportPackageIcon pkg={pkg} syncUnit={selectedSyncUnit} />
                            <strong>{item.primitiveName}</strong>
                            <span className={`target-export-state-pill ${row.stateClass}`}>
                                {row.status}
                            </span>
                            <button
                                type="button"
                                className="icon-btn target-export-detail-btn"
                                onClick={() => onOpenDetails({
                                    kind: 'target-package',
                                    activeTarget,
                                    currentItem,
                                    definition,
                                    exportChoice,
                                    pkg,
                                    result,
                                    row: detailRow,
                                    selectedSyncUnit,
                                })}
                                title={`View details for ${item.primitiveName}`}
                                aria-label={`View details for ${item.primitiveName}`}
                            >
                                <FileSearch size={12} />
                            </button>
                        </span>
                        {row.stateClass === 'is-warning' ? <small>{row.detail}</small> : null}
                        <span className="target-export-action-choice" aria-label={`${item.primitiveName} export action`}>
                            {staged ? (
                                <>
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
                                </>
                            ) : (
                                <button type="button" className="target-export-choice-btn is-active" disabled>
                                    Keep
                                </button>
                            )}
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
                            <button
                                type="button"
                                className="icon-btn target-export-detail-btn"
                                onClick={() => onOpenDetails({
                                    kind: 'target-only-definition',
                                    activeTarget,
                                    definition,
                                    row,
                                })}
                                title={`View details for ${row.name}`}
                                aria-label={`View details for ${row.name}`}
                            >
                                <FileSearch size={12} />
                            </button>
                        </span>
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
