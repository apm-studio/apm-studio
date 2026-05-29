import type { RefObject, UIEvent } from 'react'
import { Activity, Bell, Clock, FileText, MessageCircle } from 'lucide-react'
import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import {
    type ActivityEvent,
    relativeTime,
} from './team-board-data'
import { getEventDescription } from './team-board-view-utils'

interface TeamBoardActivityListProps {
    agents: WorkspaceAgentNode[]
    events: ActivityEvent[]
    hasMore: boolean
    listRef: RefObject<HTMLDivElement | null>
    loadingMoreEvents: boolean
    team: WorkspaceTeamSnapshot | null
    onScroll: (event: UIEvent<HTMLDivElement>) => void
}

export function TeamBoardActivityList({
    agents,
    events,
    hasMore,
    listRef,
    loadingMoreEvents,
    team,
    onScroll,
}: TeamBoardActivityListProps) {
    return (
        <aside className="team-board__activity-column">
            <div className="team-board__activity">
                <div className="team-board__activity-header">
                    <Activity size={9} />
                    <span>Recent Activity</span>
                </div>
                {events.length > 0 ? (
                    <div
                        ref={listRef}
                        className="team-board__activity-list scroll-area"
                        onScroll={onScroll}
                    >
                        {events.map((event) => (
                            <div key={event.id} className="team-board__activity-item">
                                <span className="team-board__activity-icon">
                                    {getEventIcon(event.type)}
                                </span>
                                <span className="team-board__activity-copy">
                                    {getEventDescription(event, team, agents)}
                                </span>
                                <span className="team-board__activity-time">
                                    {relativeTime(event.timestamp)}
                                </span>
                            </div>
                        ))}
                        {loadingMoreEvents && (
                            <div className="team-board__activity-status">
                                Loading more activity...
                            </div>
                        )}
                        {!loadingMoreEvents && hasMore && (
                            <div className="team-board__activity-status">
                                Scroll for more
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="team-board__activity-empty">
                        <Activity size={14} className="team-board__empty-icon" />
                        <span>No recent activity yet</span>
                    </div>
                )}
            </div>
        </aside>
    )
}

function getEventIcon(type: string) {
    switch (type) {
        case 'message.sent':
        case 'message.delivered':
            return <MessageCircle size={9} />
        case 'board.posted':
        case 'board.updated':
            return <FileText size={9} />
        case 'runtime.idle':
            return <Clock size={9} />
        default:
            return <Bell size={9} />
    }
}
