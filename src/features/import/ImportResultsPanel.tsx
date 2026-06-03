import {
    ExternalLink,
    CheckSquare,
    FileSearch,
    Loader,
    Loader2,
    PackagePlus,
    SearchCheck,
    Search,
    X,
} from 'lucide-react'
import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportPreviewResponse,
} from '../../../shared/apm-contracts'
import type { RegistryListing } from '../../../shared/registry-contracts'
import { ImportCandidateCard } from './ImportCandidateCard'
import {
    candidateIsInstalled,
    githubSourceUrl,
    type ImportScope,
    type ImportInstallProgress,
    RESULT_ELEMENT_FILTERS,
    RESULT_KIND_FILTERS,
    type ResultElementFilter,
    type ResultKindFilter,
} from './import-catalog-model'
import type { ImportAssetDetailRequest } from './import-detail-model'

interface ImportResultsPanelProps {
    previewLoading: boolean
    previewError: string | null
    previewResponse: ApmGitHubImportPreviewResponse | null
    registryListings: RegistryListing[]
    filteredRegistryListings: RegistryListing[]
    registryLoading: boolean
    registryError: string | null
    registryPreviewingId: string | null
    resultCandidates: ApmGitHubImportCandidate[]
    filteredCandidates: ApmGitHubImportCandidate[]
    resultQuery: string
    resultKind: ResultKindFilter
    resultElement: ResultElementFilter
    installScope: ImportScope
    selectedCandidateIds?: Set<string>
    selectedCount: number
    selectableCandidateCount: number
    selectedVisibleCandidateCount: number
    importing: boolean
    installProgress: ImportInstallProgress | null
    candidateInstallingId: string | null
    installedPackageIds?: Set<string>
    optimisticInstalledPackageKeys?: Set<string>
    installTargetKey?: string
    workspaceInstallDisabled: boolean
    onImportSelected: () => void
    onImportCandidate: (candidateId: string) => void
    onToggleCandidate: (candidateId: string) => void
    onSelectAllCandidates: () => void
    onClearCandidateSelection: () => void
    onOpenDetails: (request: ImportAssetDetailRequest) => void
    onPreviewRegistryListing: (listing: RegistryListing) => void
    onQueryChange: (query: string) => void
    onKindChange: (kind: ResultKindFilter) => void
    onElementChange: (element: ResultElementFilter) => void
}

export function ImportResultsPanel({
    previewLoading,
    previewError,
    previewResponse,
    registryListings,
    filteredRegistryListings,
    registryLoading,
    registryError,
    registryPreviewingId,
    resultCandidates,
    filteredCandidates,
    resultQuery,
    resultKind,
    resultElement,
    installScope,
    selectedCandidateIds,
    selectedCount,
    selectableCandidateCount,
    selectedVisibleCandidateCount,
    importing,
    installProgress,
    candidateInstallingId,
    installedPackageIds,
    optimisticInstalledPackageKeys,
    installTargetKey,
    workspaceInstallDisabled,
    onImportSelected,
    onImportCandidate,
    onToggleCandidate,
    onSelectAllCandidates,
    onClearCandidateSelection,
    onOpenDetails,
    onPreviewRegistryListing,
    onQueryChange,
    onKindChange,
    onElementChange,
}: ImportResultsPanelProps) {
    const safeInstalledPackageIds = installedPackageIds ?? new Set<string>()
    const safeOptimisticInstalledPackageKeys = optimisticInstalledPackageKeys ?? new Set<string>()
    const safeSelectedCandidateIds = selectedCandidateIds ?? new Set<string>()
    const safeInstallTargetKey = installTargetKey ?? installScope
    const previewSourceUrl = previewResponse?.source.href || githubSourceUrl(previewResponse?.source.repo)
    const bulkActionDisabled = importing || !!candidateInstallingId
    const allSelectableShownSelected = selectableCandidateCount > 0
        && selectedVisibleCandidateCount === selectableCandidateCount
    const resultFiltersEnabled = Boolean(previewResponse || registryListings.length > 0)
    const registrySummary = `${filteredRegistryListings.length}/${registryListings.length} sources`
    const previewSummary = previewResponse
        ? `${filteredCandidates.length}/${resultCandidates.length} packages`
        : ''
    const installProgressPercent = installProgress
        ? Math.max(0, Math.min(100, Math.round((installProgress.completed / Math.max(installProgress.total, 1)) * 100)))
        : 0
    const openExternal = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer')
    }
    const openRegistryDetails = (listing: RegistryListing) => {
        onOpenDetails({ kind: 'registry-listing', listing })
    }

    return (
        <section className="import-page__parsed-panel" aria-label="Parsed GitHub package items">
            <header className="import-results-top">
                <div className="import-results-top__summary">
                    <div>
                        <h2>Results</h2>
                        <p>
                            {previewLoading
                            ? 'Parsing repository...'
                            : previewResponse
                                ? registryListings.length > 0
                                    ? `${previewSummary}, ${registrySummary}`
                                    : previewSummary
                                : registryLoading
                                    ? 'Searching APM Registry...'
                                    : registrySummary}
                        </p>
                    </div>
                    <div className="import-results-top__actions">
                        <button
                            type="button"
                            className="icon-btn"
                            onClick={() => previewSourceUrl ? openExternal(previewSourceUrl) : undefined}
                            disabled={!previewSourceUrl}
                            title={previewSourceUrl ? `Open ${previewSourceUrl}` : 'No GitHub source selected'}
                            aria-label="Open parsed GitHub source"
                        >
                            <ExternalLink size={14} />
                        </button>
                        <button
                            type="button"
                            className="btn btn--primary"
                            onClick={onImportSelected}
                            disabled={!previewResponse || selectedCount === 0 || importing || !!candidateInstallingId || workspaceInstallDisabled}
                        >
                            {importing ? <Loader2 size={13} className="spin" /> : <PackagePlus size={13} />}
                            Install Selected
                        </button>
                    </div>
                </div>

                <div className="import-results-controls">
                    {previewResponse ? (
                    <div className="import-results-bulk-actions" aria-label="Bulk result selection">
                        {selectedCount > 0 ? (
                            <span className="badge badge--subtle import-results-selected-count">
                                {selectedCount} selected
                            </span>
                        ) : null}
                        <button
                            type="button"
                            className="btn btn--sm"
                            onClick={onSelectAllCandidates}
                            disabled={!previewResponse || selectableCandidateCount === 0 || allSelectableShownSelected || bulkActionDisabled}
                            title="Select all visible installable results"
                        >
                            <CheckSquare size={12} />
                            Select all
                        </button>
                        <button
                            type="button"
                            className="btn btn--sm"
                            onClick={onClearCandidateSelection}
                            disabled={!previewResponse || selectedVisibleCandidateCount === 0 || bulkActionDisabled}
                            title="Clear selected visible results"
                        >
                            <X size={12} />
                            Clear
                        </button>
                    </div>
                    ) : null}
                    <label className="import-result-search" aria-label="Search results">
                        <Search size={13} />
                        <input
                            className="input"
                            value={resultQuery}
                            onChange={(event) => onQueryChange(event.target.value)}
                            placeholder="Search results"
                            disabled={!resultFiltersEnabled}
                        />
                    </label>
                    <select
                        className="select import-result-kind"
                        value={resultKind}
                        onChange={(event) => onKindChange(event.target.value as ResultKindFilter)}
                        disabled={!resultFiltersEnabled}
                        aria-label="Filter result kind"
                    >
                        {RESULT_KIND_FILTERS.map((filter) => (
                            <option key={filter.value} value={filter.value}>{filter.label}</option>
                        ))}
                    </select>
                </div>
                <div className="import-apm-element-row" role="tablist" aria-label="Filter APM element">
                    {RESULT_ELEMENT_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            className={`tab import-apm-element-tab ${resultElement === filter.value ? 'active' : ''}`}
                            role="tab"
                            aria-selected={resultElement === filter.value}
                            onClick={() => onElementChange(filter.value)}
                            disabled={!resultFiltersEnabled}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="import-results-scroll">
                {previewError ? (
                    <div className="alert alert--danger import-parsed-alert">{previewError}</div>
                ) : null}
                {registryError ? (
                    <div className="alert alert--danger import-parsed-alert">{registryError}</div>
                ) : null}
                {previewResponse?.warnings.length ? (
                    <div className="alert alert--muted import-parsed-alert">{previewResponse.warnings[0]}</div>
                ) : null}
                {installProgress ? (
                    <div className={`import-install-progress import-install-progress--${installProgress.phase}`} role="status" aria-live="polite">
                        <div className="import-install-progress__header">
                            <span>{installProgress.message}</span>
                            <span>{installProgress.completed}/{installProgress.total}</span>
                        </div>
                        <div className="import-install-progress__track" aria-hidden="true">
                            <div
                                className="import-install-progress__bar"
                                style={{ width: `${installProgressPercent}%` }}
                            />
                        </div>
                    </div>
                ) : null}

                {registryLoading && !previewResponse ? (
                    <div className="import-parsed-empty">
                        <Loader2 size={16} className="spin" />
                        <span>Searching APM Registry...</span>
                    </div>
                ) : registryListings.length > 0 ? (
                    <div className="import-registry-list">
                        <div className="import-registry-list__header">
                            <SearchCheck size={14} />
                            <span>Registry</span>
                            <span className="badge badge--subtle">{filteredRegistryListings.length}/{registryListings.length}</span>
                        </div>
                        {filteredRegistryListings.map((listing) => (
                            <article key={listing.id} className="package-card import-registry-item">
                                <div className="import-registry-item__body">
                                    <div className="package-card__header">
                                        <SearchCheck size={13} className="primitive-icon skill" />
                                        <span className="package-card__name">{listing.name}</span>
                                    </div>
                                    <div className="package-card__author" title={`${listing.source.repo}${listing.source.path ? `/${listing.source.path}` : ''}`}>
                                        {listing.kind}
                                    </div>
                                    <div className="package-card__desc">
                                        {listing.summary}
                                    </div>
                                    <div className="import-registry-item__meta">
                                        <span>{listing.trust.level}</span>
                                        <span>{listing.importRecipe.format}</span>
                                    </div>
                                </div>
                                <div className="import-registry-item__actions">
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        onClick={(event) => {
                                            event.preventDefault()
                                            event.stopPropagation()
                                            openRegistryDetails(listing)
                                        }}
                                        title={`View details for ${listing.name}`}
                                        aria-label={`View details for ${listing.name}`}
                                    >
                                        <FileSearch size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        onClick={() => {
                                            const url = githubSourceUrl(listing.source.repo)
                                            if (url) openExternal(url)
                                        }}
                                        title={`Open ${listing.source.repo} on GitHub`}
                                        aria-label={`Open ${listing.name} on GitHub`}
                                    >
                                        <ExternalLink size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn--sm btn--primary"
                                        onClick={() => onPreviewRegistryListing(listing)}
                                        disabled={!!registryPreviewingId || previewLoading}
                                        title={`Preview ${listing.name}`}
                                    >
                                        {registryPreviewingId === listing.id ? <Loader size={12} className="spin" /> : <Search size={12} />}
                                        Preview
                                    </button>
                                </div>
                            </article>
                        ))}
                        {filteredRegistryListings.length === 0 ? (
                            <div className="import-parsed-empty">
                                <Search size={16} />
                                <span>No registry results match this search or filter.</span>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {previewLoading ? (
                    <div className="import-parsed-empty">
                        <Loader2 size={16} className="spin" />
                        <span>Parsing repository...</span>
                    </div>
                ) : previewResponse ? (
                    <div className="import-parsed-grid">
                        {filteredCandidates.map((candidate) => {
                            const installed = candidateIsInstalled(
                                candidate,
                                safeInstalledPackageIds,
                                safeOptimisticInstalledPackageKeys,
                                safeInstallTargetKey,
                            )
                            return (
                                <ImportCandidateCard
                                    key={candidate.id}
                                    candidate={candidate}
                                    selected={safeSelectedCandidateIds.has(candidate.id)}
                                    installing={candidateInstallingId === candidate.id}
                                    installed={installed}
                                    importing={importing}
                                    installScope={installScope}
                                    workspaceInstallDisabled={workspaceInstallDisabled}
                                    onToggle={onToggleCandidate}
                                    onInstall={onImportCandidate}
                                    onOpenDetails={(candidate) => onOpenDetails({
                                        kind: 'candidate',
                                        candidate,
                                        previewSource: previewResponse.source,
                                        installScope,
                                        installed,
                                        selected: safeSelectedCandidateIds.has(candidate.id),
                                    })}
                                />
                            )
                        })}
                        {filteredCandidates.length === 0 ? (
                            <div className="import-parsed-empty">
                                <Search size={16} />
                                <span>No results match this search or filter.</span>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </section>
    )
}
