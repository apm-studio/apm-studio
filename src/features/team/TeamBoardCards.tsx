import { Clipboard, Pin } from 'lucide-react'
import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import {
    type BoardEntry,
    relativeTime,
    STATUS_LABELS,
} from './team-board-data'
import {
    KIND_LABELS,
    resolveBoardAuthorLabel,
    type FilterKind,
} from './team-board-view-utils'

interface TeamBoardCardsProps {
    agents: WorkspaceAgentNode[]
    entries: BoardEntry[]
    expandedKeys: Set<string>
    filter: FilterKind
    loadingExpandedKeys: Set<string>
    totalEntryCount: number
    team: WorkspaceTeamSnapshot | null
    onToggleExpand: (key: string) => void
}

export function TeamBoardCards({
    agents,
    entries,
    expandedKeys,
    filter,
    loadingExpandedKeys,
    totalEntryCount,
    team,
    onToggleExpand,
}: TeamBoardCardsProps) {
    if (entries.length === 0) {
        return (
            <div className="team-board__empty">
                <Clipboard size={20} className="team-board__empty-icon" />
                <span>
                    {totalEntryCount === 0
                        ? 'No shared board yet'
                        : `No ${KIND_LABELS[filter].toLowerCase()} found`}
                </span>
            </div>
        )
    }

    return (
        <div className="team-board__cards scroll-area">
            {entries.map((entry) => (
                <TeamBoardCard
                    key={entry.id}
                    agents={agents}
                    entry={entry}
                    expanded={expandedKeys.has(entry.key)}
                    loadingExpanded={loadingExpandedKeys.has(entry.key)}
                    team={team}
                    onToggleExpand={onToggleExpand}
                />
            ))}
        </div>
    )
}

interface TeamBoardCardProps {
    agents: WorkspaceAgentNode[]
    entry: BoardEntry
    expanded: boolean
    loadingExpanded: boolean
    team: WorkspaceTeamSnapshot | null
    onToggleExpand: (key: string) => void
}

function TeamBoardCard({
    agents,
    entry,
    expanded,
    loadingExpanded,
    team,
    onToggleExpand,
}: TeamBoardCardProps) {
    const isLong = entry.content.length > 220 || entry.content.split('\n').length > 6

    return (
        <div className="team-board__card">
            <div className="team-board__card-header">
                <span className={`team-board__badge team-board__badge--${entry.kind}`}>
                    {entry.kind}
                </span>
                {entry.kind === 'task' && entry.status && (
                    <span className="team-board__task-status">
                        <span className={`team-board__task-dot team-board__task-dot--${entry.status}`} />
                        <span className={`team-board__task-label--${entry.status}`}>
                            {STATUS_LABELS[entry.status]}
                        </span>
                    </span>
                )}
                <span className="team-board__card-title">{entry.key}</span>
                <span className="team-board__card-author">
                    {resolveBoardAuthorLabel(team, agents, entry.author)}
                </span>
            </div>
            <div
                className={`team-board__card-content ${expanded ? 'team-board__card-content--expanded' : ''}`}
            >
                <MarkdownRenderer content={entry.content} showThinking={false} />
            </div>
            {isLong && (
                <button
                    className="team-board__expand-btn"
                    onClick={() => onToggleExpand(entry.key)}
                    disabled={loadingExpanded}
                >
                    {loadingExpanded
                        ? 'Loading...'
                        : expanded
                            ? 'Show less'
                            : 'Show more'}
                </button>
            )}
            <div className="team-board__card-footer">
                {entry.pinned && <Pin size={8} className="team-board__pin" />}
                <span>v{entry.version}</span>
                <span>&middot;</span>
                <span>{relativeTime(entry.timestamp)}</span>
            </div>
        </div>
    )
}
