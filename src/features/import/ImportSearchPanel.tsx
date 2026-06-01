import {
    ExternalLink,
    Loader2,
    Search,
} from 'lucide-react'
import type { ApmGitHubImportFormat } from '../../../shared/apm-contracts'
import {
    CURATED_GITHUB_REPOS,
    githubSourceUrl,
    IMPORT_FORMATS,
    type ImportScope,
    scopeLabel,
} from './import-catalog-model'

interface ImportSearchPanelProps {
    source: string
    format: ApmGitHubImportFormat
    installScope: ImportScope
    installTargetPath: string
    loading: boolean
    onSourceChange: (source: string) => void
    onFormatChange: (format: ApmGitHubImportFormat) => void
    onSearch: () => void
    onCuratedSearch: (source: string, format: ApmGitHubImportFormat) => void
}

export function ImportSearchPanel({
    source,
    format,
    installScope,
    installTargetPath,
    loading,
    onSourceChange,
    onFormatChange,
    onSearch,
    onCuratedSearch,
}: ImportSearchPanelProps) {
    const sourceUrl = githubSourceUrl(source)
    const showCurated = source.trim().length === 0
    const openExternal = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    return (
        <section className="import-search-hero" aria-label="GitHub source search">
            <div className="import-search-hero__title">
                <h1>Search</h1>
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
                <button
                    type="button"
                    className="icon-btn import-search-form__external"
                    onClick={() => sourceUrl ? openExternal(sourceUrl) : undefined}
                    disabled={!sourceUrl}
                    title={sourceUrl ? `Open ${sourceUrl}` : 'Enter a GitHub repository to open it'}
                    aria-label="Open GitHub source"
                >
                    <ExternalLink size={14} />
                </button>
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

            {showCurated ? (
                <div className="import-curated-list" aria-label="Curated GitHub repositories">
                    <div className="import-curated-list__header">
                        <span>Curated repositories</span>
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
                                    <span className="import-curated-source__repo">{curatedSource.repo}</span>
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
