import { useCallback, useState } from 'react'
import { Circle, Clipboard, User } from 'lucide-react'

import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import type { TeamThreadState } from '../../store/team/types'
import { resolveTeamParticipantLabel } from './participant-labels'
import { moveParticipantKey } from './team-chat-panel-helpers'

type TeamParticipantTabsProps = {
    teamId: string
    team: WorkspaceTeamSnapshot
    agents: WorkspaceAgentNode[]
    currentThread: TeamThreadState | null
    participantKeys: string[]
    activeParticipantKey: string | null
    isCallboardView: boolean
    participantLoadingStates: Map<string, boolean>
    selectThreadParticipant: (participantKey: string | null) => void
    reorderTeamParticipants: (teamId: string, orderedParticipantKeys: string[]) => void
}

export function TeamParticipantTabs({
    teamId,
    team,
    agents,
    currentThread,
    participantKeys,
    activeParticipantKey,
    isCallboardView,
    participantLoadingStates,
    selectThreadParticipant,
    reorderTeamParticipants,
}: TeamParticipantTabsProps) {
    const [draggedParticipantKey, setDraggedParticipantKey] = useState<string | null>(null)
    const [dropParticipantKey, setDropParticipantKey] = useState<string | null>(null)

    const clearParticipantDragState = useCallback(() => {
        setDraggedParticipantKey(null)
        setDropParticipantKey(null)
    }, [])

    const commitParticipantReorder = useCallback((overParticipantKey: string | null) => {
        if (!draggedParticipantKey || !overParticipantKey || draggedParticipantKey === overParticipantKey) {
            clearParticipantDragState()
            return
        }

        const nextKeys = moveParticipantKey(participantKeys, draggedParticipantKey, overParticipantKey)
        reorderTeamParticipants(teamId, nextKeys)
        clearParticipantDragState()
    }, [
        teamId,
        clearParticipantDragState,
        draggedParticipantKey,
        participantKeys,
        reorderTeamParticipants,
    ])

    const handleParticipantDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>, participantKey: string) => {
        event.stopPropagation()
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', participantKey)
        setDraggedParticipantKey(participantKey)
        setDropParticipantKey(participantKey)
    }, [])

    const handleParticipantDragOver = useCallback((event: React.DragEvent<HTMLButtonElement>, participantKey: string) => {
        if (!draggedParticipantKey) {
            return
        }

        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        if (dropParticipantKey !== participantKey) {
            setDropParticipantKey(participantKey)
        }
    }, [draggedParticipantKey, dropParticipantKey])

    const handleParticipantDrop = useCallback((event: React.DragEvent<HTMLButtonElement>, participantKey: string) => {
        event.preventDefault()
        event.stopPropagation()
        commitParticipantReorder(participantKey)
    }, [commitParticipantReorder])

    if (!currentThread) {
        return null
    }

    return (
        <div className="team-chat__filters">
            <button
                className={`team-chat__filter-tab ${isCallboardView ? 'team-chat__filter-tab--active' : ''}`}
                onClick={() => selectThreadParticipant(null)}
            >
                <Clipboard size={10} className="team-chat__filter-icon" />
                <span className="team-chat__filter-label">Board</span>
                <span className="team-chat__filter-status" aria-hidden="true" />
            </button>
            {participantKeys.map((key) => {
                const isActive = activeParticipantKey === key
                const isKeyLoading = participantLoadingStates.get(key) || false
                const label = resolveTeamParticipantLabel(team, key, agents)
                return (
                    <button
                        key={key}
                        className={`team-chat__filter-tab ${isActive ? 'team-chat__filter-tab--active' : ''}`}
                        onClick={() => selectThreadParticipant(key)}
                        draggable={participantKeys.length > 1}
                        onDragStart={(event) => handleParticipantDragStart(event, key)}
                        onDragEnd={clearParticipantDragState}
                        onDragOver={(event) => handleParticipantDragOver(event, key)}
                        onDrop={(event) => handleParticipantDrop(event, key)}
                        title={participantKeys.length > 1 ? `${label} · Drag to reorder` : label}
                    >
                        <User size={10} className="team-chat__filter-icon" />
                        <span className="team-chat__filter-label">{label}</span>
                        <span className="team-chat__filter-status" aria-hidden={!isKeyLoading}>
                            {isKeyLoading ? <Circle size={5} className="team-chat__loading-dot" /> : null}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
