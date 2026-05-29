import { Bot, FileText, Layers3, PackageOpen, Search, Server, Zap } from 'lucide-react'
import {
    primitiveSummary,
    PRIMITIVE_SYNC_UNITS,
    unitLabel,
    unitSourcePath,
} from './inject-sync-utils'
import { InjectSourceRows } from './InjectSourceRows'
import type { InjectControllerState } from './useInjectController'

interface InjectSourceColumnProps {
    controller: InjectControllerState
}

export function InjectSourceColumn({ controller }: InjectSourceColumnProps) {
    const {
        allVisibleSelected,
        apmPackages,
        apmPackagesLoading,
        filter,
        filteredSyncablePackages,
        packageWarnings,
        primitiveUnit,
        running,
        selectSyncUnit,
        selectedPackageIds,
        selectedPackageSet,
        selectedPrimitiveSummary,
        selectedSyncUnit,
        setFilter,
        sidebarSection,
        togglePackage,
        toggleVisiblePackages,
        visiblePackageIds,
        workspaceCounts,
    } = controller

    return (
        <section className="surface-card target-inject-source" aria-label="Studio source">
            <div className="target-inject-section-header">
                <div>
                    <div className="target-inject-panel-title">
                        <PackageOpen size={15} />
                        <h2>APM Studio</h2>
                    </div>
                    <p>{unitSourcePath(selectedSyncUnit)}</p>
                </div>
                <span className="badge badge--subtle">{unitLabel(selectedSyncUnit)}</span>
            </div>

            <div className="target-inject-source-controls">
                <div className="target-inject-source-scope" role="tablist" aria-label="Inject source unit">
                    <button
                        className={`target-inject-scope-btn ${sidebarSection === 'packages' ? 'is-active' : ''}`}
                        type="button"
                        aria-selected={sidebarSection === 'packages'}
                        role="tab"
                        onClick={() => selectSyncUnit('agent-packages')}
                    >
                        <PackageOpen size={11} />
                        Packages
                    </button>
                    <button
                        className={`target-inject-scope-btn ${sidebarSection === 'primitives' ? 'is-active' : ''}`}
                        type="button"
                        aria-selected={sidebarSection === 'primitives'}
                        role="tab"
                        onClick={() => selectSyncUnit(primitiveUnit)}
                    >
                        <Layers3 size={11} />
                        Primitives
                    </button>
                </div>

                {sidebarSection === 'primitives' ? (
                    <div className="target-inject-primitive-tabs" role="tablist" aria-label="Primitive unit">
                        {PRIMITIVE_SYNC_UNITS.map((unit) => (
                            <button
                                key={unit}
                                type="button"
                                className={`target-inject-primitive-tab ${selectedSyncUnit === unit ? 'is-active' : ''}`}
                                aria-selected={selectedSyncUnit === unit}
                                role="tab"
                                onClick={() => selectSyncUnit(unit)}
                            >
                                {unit === 'agents' ? <Bot size={10} /> : null}
                                {unit === 'instructions' ? <FileText size={10} /> : null}
                                {unit === 'skills' ? <Zap size={10} /> : null}
                                {unit === 'mcp' ? <Server size={10} /> : null}
                                {unitLabel(unit)}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className="target-inject-source-toolbar">
                    <label className="target-inject-search">
                        <Search size={12} className="icon-muted" />
                        <input
                            className="text-input"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder="package, primitive, apm.yml path..."
                        />
                    </label>
                    <button
                        className="text-btn"
                        type="button"
                        onClick={toggleVisiblePackages}
                        disabled={visiblePackageIds.length === 0 || running}
                    >
                        {allVisibleSelected ? (filter ? 'Clear visible' : 'Clear') : (filter ? 'Select visible' : 'Select all')}
                    </button>
                </div>
            </div>

            <div className="target-inject-source__summary">
                <strong>{selectedPackageIds.length} selected</strong>
                <span>{selectedPrimitiveSummary}</span>
                <span>{apmPackages.length} packages · {primitiveSummary(workspaceCounts)}</span>
                {packageWarnings > 0 ? <span>{packageWarnings} warnings</span> : null}
            </div>

            <InjectSourceRows
                packages={filteredSyncablePackages}
                running={running}
                selectedPackageSet={selectedPackageSet}
                selectedSyncUnit={selectedSyncUnit}
                togglePackage={togglePackage}
            />

            {filteredSyncablePackages.length === 0 && !apmPackagesLoading ? (
                <div className="target-inject-empty">
                    No local package contains {unitLabel(selectedSyncUnit)}.
                </div>
            ) : null}
        </section>
    )
}
