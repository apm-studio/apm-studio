import { Bot, FileText, Layers3, PackageOpen, Search, Server, Zap } from 'lucide-react'
import {
    primitiveSummary,
    PRIMITIVE_SYNC_UNITS,
    unitLabel,
} from './target-manage-sync-utils'
import { TargetManageSourceRows } from './TargetManageSourceRows'
import type { TargetManageControllerState } from './useTargetManageController'

interface TargetManageSourceColumnProps {
    controller: TargetManageControllerState
}

export function TargetManageSourceColumn({ controller }: TargetManageSourceColumnProps) {
    const {
        activeTarget,
        apmPackages,
        apmPackagesLoading,
        filter,
        filteredSyncablePackages,
        packageWarnings,
        primitiveUnit,
        running,
        selectSyncUnit,
        selectedSyncUnit,
        setFilter,
        sidebarSection,
        stagePackageForActiveTarget,
        stagedPackageIds,
        stagedPackageSet,
        stagedPrimitiveSummary,
        toggleStagedPackage,
        unsyncedPackageIds,
        visiblePackageIds,
        workspaceCounts,
    } = controller

    return (
        <section className="surface-card target-manage-source" aria-label="Studio source">
            <div className="target-manage-section-header">
                <div>
                    <div className="target-manage-panel-title">
                        <PackageOpen size={15} />
                        <h2>APM Studio</h2>
                    </div>
                </div>
            </div>

            <div className="target-manage-source-controls">
                <div className="target-manage-source-scope" role="tablist" aria-label="Export source mode">
                    <button
                        className={`target-manage-scope-btn ${sidebarSection === 'packages' ? 'is-active' : ''}`}
                        type="button"
                        aria-selected={sidebarSection === 'packages'}
                        role="tab"
                        onClick={() => selectSyncUnit('studio-agent')}
                    >
                        <Bot size={11} />
                        Studio Agent
                    </button>
                    <button
                        className={`target-manage-scope-btn ${sidebarSection === 'primitives' ? 'is-active' : ''}`}
                        type="button"
                        aria-selected={sidebarSection === 'primitives'}
                        role="tab"
                        onClick={() => selectSyncUnit(primitiveUnit)}
                    >
                        <Layers3 size={11} />
                        APM Primitives
                    </button>
                </div>

                {sidebarSection === 'primitives' ? (
                    <div className="target-manage-primitive-tabs" role="tablist" aria-label="Primitive unit">
                        {PRIMITIVE_SYNC_UNITS.map((unit) => (
                            <button
                                key={unit}
                                type="button"
                                className={`target-manage-primitive-tab ${selectedSyncUnit === unit ? 'is-active' : ''}`}
                                aria-selected={selectedSyncUnit === unit}
                                role="tab"
                                onClick={() => selectSyncUnit(unit)}
                            >
                                {unit === 'agents' ? <Bot size={10} /> : null}
                                {unit === 'instructions' ? <FileText size={10} /> : null}
                                {unit === 'skills' ? <Zap size={10} /> : null}
                                {unit === 'prompts' ? <FileText size={10} /> : null}
                                {unit === 'commands' ? <FileText size={10} /> : null}
                                {unit === 'hooks' ? <Zap size={10} /> : null}
                                {unit === 'mcp' ? <Server size={10} /> : null}
                                {unitLabel(unit)}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className="target-manage-source-toolbar">
                    <label className="target-manage-search">
                        <Search size={12} className="icon-muted" />
                        <input
                            className="text-input"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder="package, primitive, target path..."
                        />
                    </label>
                    <span className="badge badge--subtle">{visiblePackageIds.length} available</span>
                </div>
            </div>

            <div className="target-manage-source__summary">
                <strong>{stagedPackageIds.length} staged</strong>
                {unsyncedPackageIds.length > 0 ? <span>{unsyncedPackageIds.length} unsynced</span> : null}
                <span>{stagedPrimitiveSummary}</span>
                <span>{apmPackages.length} packages · {primitiveSummary(workspaceCounts)}</span>
                {packageWarnings > 0 ? <span>{packageWarnings} warnings</span> : null}
            </div>

            <TargetManageSourceRows
                packages={filteredSyncablePackages}
                activeTarget={activeTarget}
                packageSyncStateByPackage={controller.activeTargetPackageSyncStateByPackage}
                running={running}
                selectedSyncUnit={selectedSyncUnit}
                stagePackageForActiveTarget={stagePackageForActiveTarget}
                stagedPackageSet={stagedPackageSet}
                toggleStagedPackage={toggleStagedPackage}
            />

            {filteredSyncablePackages.length === 0 && !apmPackagesLoading ? (
                <div className="target-manage-empty">
                    No local package contains {unitLabel(selectedSyncUnit)}.
                </div>
            ) : null}
        </section>
    )
}
