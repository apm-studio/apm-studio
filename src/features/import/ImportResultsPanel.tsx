import {
    FolderOpen,
    Globe2,
    Loader2,
    PackagePlus,
    Search,
} from 'lucide-react'
import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportPreviewResponse,
} from '../../../shared/apm-contracts'
import { ImportCandidateCard } from './ImportCandidateCard'
import {
    candidateInstallKey,
    type ImportScope,
    RESULT_KIND_FILTERS,
    type ResultKindFilter,
    scopeLabel,
} from './import-catalog-model'

interface ImportResultsPanelProps {
    previewLoading: boolean
    previewError: string | null
    previewResponse: ApmGitHubImportPreviewResponse | null
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
    onQueryChange: (query: string) => void
    onKindChange: (kind: ResultKindFilter) => void
    onScopeChange: (scope: ImportScope) => void
}

export function ImportResultsPanel({
    previewLoading,
    previewError,
    previewResponse,
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
    onQueryChange,
    onKindChange,
    onScopeChange,
}: ImportResultsPanelProps) {
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
                                    : 'No parsed results yet.'}
                        </p>
                    </div>
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
                    <div className="import-install-scope" aria-label="Install target">
                        <button
                            type="button"
                            className={`tab ${installScope === 'workspace' ? 'active' : ''}`}
                            onClick={() => onScopeChange('workspace')}
                        >
                            <FolderOpen size={12} />
                            Workspace
                        </button>
                        <button
                            type="button"
                            className={`tab ${installScope === 'user' ? 'active' : ''}`}
                            onClick={() => onScopeChange('user')}
                        >
                            <Globe2 size={12} />
                            User
                        </button>
                    </div>
                </div>
                <p className="import-install-target" title={installTargetPath}>{scopeLabel(installScope)}: {installTargetPath}</p>
            </header>

            <div className="import-results-scroll">
                {previewError ? (
                    <div className="alert alert--danger import-parsed-alert">{previewError}</div>
                ) : null}
                {previewResponse?.warnings.length ? (
                    <div className="alert alert--muted import-parsed-alert">{previewResponse.warnings[0]}</div>
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
