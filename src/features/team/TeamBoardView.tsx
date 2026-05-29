import { useMemo, useState } from 'react'
import { useStudioStore } from '../../store'
import { TeamBoardActivityList } from './TeamBoardActivityList'
import { TeamBoardCards } from './TeamBoardCards'
import { TeamBoardHeader } from './TeamBoardHeader'
import {
    type FilterKind,
    filterBoardEntries,
    getBoardKindCounts,
} from './team-board-view-utils'
import { useTeamBoardData } from './useTeamBoardData'
import './TeamBoardView.css'

interface TeamBoardViewProps {
    teamId: string
    threadId: string
}

export default function TeamBoardView({ teamId, threadId }: TeamBoardViewProps) {
    const team = useStudioStore((state) => state.teams.find((item) => item.id === teamId) || null)
    const agents = useStudioStore((state) => state.agents)
    const [filter, setFilter] = useState<FilterKind>('artifact')
    const {
        activityListRef,
        activityState,
        entries,
        expandedKeys,
        handleActivityScroll,
        lastUpdated,
        loadData,
        loading,
        loadingExpandedKeys,
        loadingMoreEvents,
        toggleExpand,
    } = useTeamBoardData(teamId, threadId)

    const filteredEntries = useMemo(
        () => filterBoardEntries(entries, filter),
        [entries, filter],
    )
    const kindCounts = useMemo(() => getBoardKindCounts(entries), [entries])

    return (
        <div className="team-board">
            <TeamBoardHeader
                filter={filter}
                kindCounts={kindCounts}
                lastUpdated={lastUpdated}
                loading={loading}
                onFilterChange={setFilter}
                onRefresh={loadData}
            />

            <div className="team-board__body">
                <div className="team-board__main">
                    <TeamBoardCards
                        agents={agents}
                        entries={filteredEntries}
                        expandedKeys={expandedKeys}
                        filter={filter}
                        loadingExpandedKeys={loadingExpandedKeys}
                        totalEntryCount={entries.length}
                        team={team}
                        onToggleExpand={toggleExpand}
                    />
                </div>

                <TeamBoardActivityList
                    agents={agents}
                    events={activityState.events}
                    hasMore={activityState.hasMore}
                    listRef={activityListRef}
                    loadingMoreEvents={loadingMoreEvents}
                    team={team}
                    onScroll={handleActivityScroll}
                />
            </div>
        </div>
    )
}
