import { RefreshCw } from 'lucide-react'
import { relativeTime } from './team-board-data'
import {
    FILTER_KINDS,
    KIND_LABELS,
    type FilterKind,
} from './team-board-view-utils'

interface TeamBoardHeaderProps {
    filter: FilterKind
    kindCounts: Record<FilterKind, number>
    lastUpdated: number | null
    loading: boolean
    onFilterChange: (filter: FilterKind) => void
    onRefresh: () => void
}

export function TeamBoardHeader({
    filter,
    kindCounts,
    lastUpdated,
    loading,
    onFilterChange,
    onRefresh,
}: TeamBoardHeaderProps) {
    return (
        <div className="team-board__header">
            <div className="team-board__tabs" role="tablist" aria-label="Board filters">
                {FILTER_KINDS.map((kind) => (
                    <button
                        key={kind}
                        className={`team-board__tab ${filter === kind ? 'team-board__tab--active' : ''}`}
                        onClick={() => onFilterChange(kind)}
                        role="tab"
                        aria-selected={filter === kind}
                    >
                        <span>{KIND_LABELS[kind]}</span>
                        {(kindCounts[kind] || 0) > 0 && (
                            <span className="team-board__tab-count">
                                {kindCounts[kind]}
                            </span>
                        )}
                    </button>
                ))}
            </div>
            <div className="team-board__toolbar">
                {lastUpdated && (
                    <span className="team-board__freshness">
                        {relativeTime(lastUpdated)}
                    </span>
                )}
                <button
                    className="icon-btn team-board__refresh-btn"
                    onClick={onRefresh}
                    disabled={loading}
                    title="Refresh"
                >
                    <RefreshCw size={10} className={loading ? 'spinning' : ''} />
                </button>
            </div>
        </div>
    )
}
