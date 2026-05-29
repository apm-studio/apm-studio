import type { ReactNode } from 'react'
import type { ChatMessage } from '../../store/session/chat-message-types'
import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import type { TeamThreadState } from '../../store/team/types'
import ThreadBody from '../chat/ThreadBody'
import { shouldShowAssistantLoadingPlaceholder } from '../chat/chat-message-visibility'
import TeamBoardView from './TeamBoardView'
import { TeamParticipantTabs } from './TeamParticipantTabs'

type TeamChatThreadSurfaceProps = {
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
    messages: ChatMessage[]
    isLoading: boolean
    chatKey: string | null
    renderMessage: (message: ChatMessage, index: number) => ReactNode
    renderEmpty: () => ReactNode
    renderLoading: () => ReactNode
    composer: ReactNode
}

export default function TeamChatThreadSurface({
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
    messages,
    isLoading,
    chatKey,
    renderMessage,
    renderEmpty,
    renderLoading,
    composer,
}: TeamChatThreadSurfaceProps) {
    return (
        <>
            <TeamParticipantTabs
                teamId={teamId}
                team={team}
                agents={agents}
                currentThread={currentThread}
                participantKeys={participantKeys}
                activeParticipantKey={activeParticipantKey}
                isCallboardView={isCallboardView}
                participantLoadingStates={participantLoadingStates}
                selectThreadParticipant={selectThreadParticipant}
                reorderTeamParticipants={reorderTeamParticipants}
            />

            {isCallboardView && currentThread ? (
                <TeamBoardView teamId={teamId} threadId={currentThread.id} />
            ) : (
                <ThreadBody
                    messages={messages}
                    loading={shouldShowAssistantLoadingPlaceholder(messages, isLoading)}
                    scrollStateKey={chatKey}
                    scrollRestoreMode="bottom"
                    renderMessage={renderMessage}
                    renderEmpty={renderEmpty}
                    renderLoading={renderLoading}
                    composer={composer}
                />
            )}
        </>
    )
}
