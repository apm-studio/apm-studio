import {
    Loader2,
    Search,
} from 'lucide-react'
import type { ApmGitHubImportFormat } from '../../../shared/apm-contracts'
import {
    CURATED_GITHUB_REPOS,
    IMPORT_FORMATS,
} from './import-catalog-model'

interface ImportSearchPanelProps {
    source: string
    format: ApmGitHubImportFormat
    loading: boolean
    onSourceChange: (source: string) => void
    onFormatChange: (format: ApmGitHubImportFormat) => void
    onSearch: () => void
    onCuratedSearch: (source: string, format: ApmGitHubImportFormat) => void
}

export function ImportSearchPanel({
    source,
    format,
    loading,
    onSourceChange,
    onFormatChange,
    onSearch,
    onCuratedSearch,
}: ImportSearchPanelProps) {
    return (
        <section className="import-search-hero" aria-label="GitHub source search">
            <div className="import-search-hero__title">
                <h1>Search</h1>
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
                    placeholder="Search GitHub source or paste owner/repo"
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

            <div className="import-curated-repos" aria-label="Curated GitHub repositories">
                <span>Curated</span>
                {CURATED_GITHUB_REPOS.map((curatedSource) => (
                    <button
                        key={curatedSource.repo}
                        type="button"
                        onClick={() => onCuratedSearch(curatedSource.repo, 'auto')}
                        title={curatedSource.repo}
                    >
                        {curatedSource.name}
                    </button>
                ))}
            </div>
        </section>
    )
}
