import {
    ExternalLink,
    Loader,
    Loader2,
    PackagePlus,
    SearchCheck,
    Search,
} from 'lucide-react'
import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportPreviewResponse,
} from '../../../shared/apm-contracts'
import type { RegistryListing } from '../../../shared/registry-contracts'
import { ImportCandidateCard } from './ImportCandidateCard'
import {
    candidateInstallKey,
    githubSourceUrl,
    type ImportScope,
    RESULT_KIND_FILTERS,
    type ResultKindFilter,
    scopeLabel,
} from './import-catalog-model'

interface ImportResultsPanelProps {
    previewLoading: boolean
    previewError: string | null
    previewResponse: ApmGitHubImportPreviewResponse | null
    registryListings: RegistryListing[]
    registryLoading: boolean
    registryError: string | null
    registryPreviewingId: string | null
    resultCandidates: ApmGitHubImportCandidate[]
    filteredCandidates: ApmGitHubImportCandidate[]
    resultQuery: string
    resultKind: ResultKindFilter
    installScope: ImportScope
    installTargetPath: string
    selectedCandidateIds: Set<string>
    selectedCount: number
    importing: boolean
    candidateInstallingId: string | null
    installedCandidateKeys: Set<string>
    workspaceInstallDisabled: boolean
    onImportSelected: () => void
    onImportCandidate: (candidateId: string) => void
    onToggleCandidate: (candidateId: string) => void
    onPreviewRegistryListing: (listing: RegistryListing) => void
    onQueryChange: (query: string) => void
    onKindChange: (kind: ResultKindFilter) => void
}

export function ImportResultsPanel({
    previewLoading,
    previewError,
    previewResponse,
    registryListings,
    registryLoading,
    registryError,
    registryPreviewingId,
    resultCandidates,
    filteredCandidates,
    resultQuery,
    resultKind,
    installScope,
    installTargetPath,
    selectedCandidateIds,
    selectedCount,
    importing,
    candidateInstallingId,
    installedCandidateKeys,
    workspaceInstallDisabled,
    onImportSelected,
    onImportCandidate,
    onToggleCandidate,
    onPreviewRegistryListing,
    onQueryChange,
    onKindChange,
}: ImportResultsPanelProps) {
    const previewSourceUrl = previewResponse?.source.href || githubSourceUrl(previewResponse?.source.repo)
    const openExternal = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer')
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
                                ? `${previewResponse.source.repo} - ${filteredCandidates.length}/${resultCandidates.length} shown`
                                : registryLoading
                                    ? 'Searching APM Registry...'
                                    : `${registryListings.length} registry result${registryListings.length === 1 ? '' : 's'}`}
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
                    <label className="import-result-search" aria-label="Search results">
                        <Search size={13} />
                        <input
                            className="input"
                            value={resultQuery}
                            onChange={(event) => onQueryChange(event.target.value)}
                            placeholder="Search results"
                            disabled={!previewResponse}
                        />
                    </label>
                    <select
                        className="select import-result-kind"
                        value={resultKind}
                        onChange={(event) => onKindChange(event.target.value as ResultKindFilter)}
                        disabled={!previewResponse}
                        aria-label="Filter result kind"
                    >
                        {RESULT_KIND_FILTERS.map((filter) => (
                            <option key={filter.value} value={filter.value}>{filter.label}</option>
                        ))}
                    </select>
                </div>
                <p className="import-install-target" title={installTargetPath}>{scopeLabel(installScope)}: {installTargetPath}</p>
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
                        </div>
                        {registryListings.map((listing) => (
                            <article key={listing.id} className="package-card import-registry-item">
                                <div className="import-registry-item__body">
                                    <div className="package-card__header">
                                        <SearchCheck size={13} className="primitive-icon skill" />
                                        <span className="package-card__name">{listing.name}</span>
                                    </div>
                                    <div className="package-card__author" title={`${listing.source.repo}${listing.source.path ? `/${listing.source.path}` : ''}`}>
                                        {listing.kind} / {listing.source.repo}{listing.source.path ? `/${listing.source.path}` : ''}
                                    </div>
                                    <div className="package-card__desc">
                                        {listing.summary}
                                    </div>
                                    <div className="import-registry-item__meta">
                                        <span>{listing.importRecipe.format}</span>
                                        <span>{listing.trust.level}</span>
                                        <span>{listing.downloads || 0} downloads</span>
                                    </div>
                                </div>
                                <div className="import-registry-item__actions">
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
                    </div>
                ) : null}

                {previewLoading ? (
                    <div className="import-parsed-empty">
                        <Loader2 size={16} className="spin" />
                        <span>Parsing repository...</span>
                    </div>
                ) : previewResponse ? (
                    <div className="import-parsed-grid">
                        {filteredCandidates.map((candidate) => (
                            <ImportCandidateCard
                                key={candidate.id}
                                candidate={candidate}
                                selected={selectedCandidateIds.has(candidate.id)}
                                installing={candidateInstallingId === candidate.id}
                                installed={installedCandidateKeys.has(candidateInstallKey(installScope, candidate.id))}
                                importing={importing}
                                installScope={installScope}
                                workspaceInstallDisabled={workspaceInstallDisabled}
                                onToggle={onToggleCandidate}
                                onInstall={onImportCandidate}
                            />
                        ))}
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
