import {
    ExternalLink,
    History,
    Loader2,
    Search,
    X,
} from 'lucide-react'
import type { ApmGitHubImportFormat } from '../../../shared/apm-contracts'
import {
    CURATED_GITHUB_REPOS,
    githubSourceUrl,
    importFormatLabel,
    IMPORT_FORMATS,
    type ImportSearchHistoryEntry,
    type ImportScope,
    scopeLabel,
} from './import-catalog-model'

interface ImportSearchPanelProps {
    source: string
    format: ApmGitHubImportFormat
    installScope: ImportScope
    installTargetPath: string
    loading: boolean
    searchHistory: ImportSearchHistoryEntry[]
    onSourceChange: (source: string) => void
    onFormatChange: (format: ApmGitHubImportFormat) => void
    onSearch: () => void
    onCuratedSearch: (source: string, format: ApmGitHubImportFormat) => void
    onHistorySearch: (entry: ImportSearchHistoryEntry) => void
    onClearHistory: () => void
}

export function ImportSearchPanel({
    source,
    format,
    installScope,
    installTargetPath,
    loading,
    searchHistory,
    onSourceChange,
    onFormatChange,
    onSearch,
    onCuratedSearch,
    onHistorySearch,
    onClearHistory,
}: ImportSearchPanelProps) {
    const showCurated = source.trim().length === 0
    const openExternal = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    return (
        <section className="import-search-hero" aria-label="GitHub source search">
            <div className="import-search-hero__title">
                <h1>Import</h1>
                <span className="import-search-hero__scope" title={installTargetPath}>
                    Install to {scopeLabel(installScope)}
                </span>
            </div>

            <form
                className="import-search-form"
                onSubmit={(event) => {
                    event.preventDefault()
                    onSearch()
                }}
            >
                <Search size={17} />
                <input
                    className="input"
                    value={source}
                    onChange={(event) => onSourceChange(event.target.value)}
                    placeholder="Search registry or paste owner/repo"
                />
                <select
                    className="select"
                    value={format}
                    onChange={(event) => onFormatChange(event.target.value as ApmGitHubImportFormat)}
                    aria-label="GitHub import format"
                >
                    {IMPORT_FORMATS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
                <button className="btn btn--primary" type="submit" disabled={loading || !source.trim()}>
                    {loading ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
                    Search
                </button>
            </form>

            {searchHistory.length > 0 ? (
                <div className="import-search-history" aria-label="Recent import searches">
                    <div className="import-search-history__header">
                        <span>Recent searches</span>
                        <button
                            type="button"
                            className="icon-btn"
                            onClick={onClearHistory}
                            title="Clear recent searches"
                            aria-label="Clear recent searches"
                        >
                            <X size={12} />
                        </button>
                    </div>
                    <div className="import-search-history__items">
                        {searchHistory.map((entry) => (
                            <button
                                key={`${entry.source}:${entry.format}`}
                                type="button"
                                className="import-search-history__item"
                                onClick={() => onHistorySearch(entry)}
                                title={`Search ${entry.source}`}
                            >
                                <History size={12} />
                                <span className="import-search-history__source">{entry.source}</span>
                                <span className="badge badge--subtle">{importFormatLabel(entry.format)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {showCurated ? (
                <div className="import-curated-list" aria-label="Curated GitHub repositories">
                    <div className="import-curated-list__header">
                        <span>Suggested sources</span>
                    </div>
                    <div className="import-curated-list__grid">
                        {CURATED_GITHUB_REPOS.map((curatedSource) => (
                            <article key={curatedSource.repo} className="package-card import-curated-source">
                                <button
                                    type="button"
                                    className="import-curated-source__main"
                                    onClick={() => onCuratedSearch(curatedSource.repo, 'auto')}
                                    title={`Preview ${curatedSource.repo}`}
                                >
                                    <span className="import-curated-source__name">{curatedSource.name}</span>
                                </button>
                                <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => {
                                        const url = githubSourceUrl(curatedSource.repo)
                                        if (url) openExternal(url)
                                    }}
                                    title={`Open ${curatedSource.repo} on GitHub`}
                                    aria-label={`Open ${curatedSource.name} on GitHub`}
                                >
                                    <ExternalLink size={13} />
                                </button>
                            </article>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    )
}
