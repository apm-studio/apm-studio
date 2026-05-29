import { AlertCircle, Pencil, Plus, User, Users, Workflow } from 'lucide-react'

import type { ChatMessage } from '../../store/session/chat-message-types'
import { TextShimmer } from '../../components/chat/TextShimmer'
import ChatMessageContent from '../chat/ChatMessageContent'
import {
    hasVisibleAssistantMessageContent,
    hasVisibleUserMessageContent,
    isStreamingAssistantMessage,
} from '../chat/chat-message-visibility'
import type { TeamReadinessResult } from './team-readiness'

type TeamChatMessageProps = {
    message: ChatMessage
    index: number
    messages: ChatMessage[]
    isLoading: boolean
}

export function TeamChatMessage({ message, index, messages, isLoading }: TeamChatMessageProps) {
    const isStreamingAssistant = isStreamingAssistantMessage(messages, index, isLoading)
    if (message.role === 'user' && !hasVisibleUserMessageContent(message)) {
        return null
    }
    if (message.role === 'assistant' && !hasVisibleAssistantMessageContent(message)) {
        return null
    }
    return (
        <div className={`thread-msg thread-msg--${message.role}`} data-scrollable>
            {message.role === 'user' ? (
                <div className="user-input-box">
                    <span className="user-input-text">{message.content}</span>
                </div>
            ) : message.role === 'system' ? (
                <div className={`team-chat__system ${message.metadata?.isWakeUp ? 'team-chat__system--wakeup' : ''}`}>
                    {message.metadata?.isWakeUp && <Workflow size={10} />}
                    {message.content}
                </div>
            ) : (
                <ChatMessageContent message={message} streaming={isStreamingAssistant} />
            )}
        </div>
    )
}

type TeamChatEmptyStateProps = {
    noParticipants: boolean
    readiness: TeamReadinessResult
    hasCurrentThread: boolean
    modelConfigured: boolean
    activeParticipantLabel: string | null
    activeParticipantKey: string | null
    isCreatingThread: boolean
    onCreateThread: () => void
    onEditTeam: () => void
}

export function TeamChatEmptyState({
    noParticipants,
    readiness,
    hasCurrentThread,
    modelConfigured,
    activeParticipantLabel,
    activeParticipantKey,
    isCreatingThread,
    onCreateThread,
    onEditTeam,
}: TeamChatEmptyStateProps) {
    if (noParticipants) {
        return (
            <div className="team-chat__empty">
                <Users size={20} className="team-chat__empty-icon" />
                <strong>No participants bound</strong>
                <span>Enter edit mode to connect agents on the canvas.</span>
                <button className="team-chat__action-btn" onClick={onEditTeam}>
                    <Pencil size={11} /> Edit Team
                </button>
            </div>
        )
    }

    if (!readiness.runnable) {
        return (
            <div className="team-chat__empty">
                <AlertCircle size={20} className="team-chat__empty-icon" />
                <strong>Team is not ready to run</strong>
                <div className="team-chat__issues">
                    {readiness.issues
                        .filter((issue) => issue.severity === 'error')
                        .map((issue, index) => (
                            <span key={index} className="team-chat__issue-item">
                                {issue.message}
                            </span>
                        ))}
                </div>
                <button className="team-chat__action-btn" onClick={onEditTeam}>
                    <Pencil size={11} /> Edit Team
                </button>
            </div>
        )
    }

    if (!hasCurrentThread) {
        return (
            <div className="team-chat__empty">
                <Workflow size={20} className="team-chat__empty-icon" />
                <strong>Ready to run</strong>
                <span>Create a thread to start the Team runtime.</span>
                <button
                    className="team-chat__action-btn"
                    onClick={onCreateThread}
                    disabled={isCreatingThread}
                >
                    <Plus size={11} /> {isCreatingThread ? 'Creating…' : 'Create Thread'}
                </button>
            </div>
        )
    }

    if (!modelConfigured) {
        return (
            <div className="team-chat__empty">
                <User size={20} className="team-chat__empty-icon" />
                <strong>Model not configured</strong>
                <span>Set up a model for "{activeParticipantLabel || activeParticipantKey}" in the agent editor.</span>
            </div>
        )
    }

    return (
        <div className="team-chat__empty">
            <User size={20} className="team-chat__empty-icon" />
            <strong>Chat with {activeParticipantLabel || activeParticipantKey}</strong>
            <span>Send a message below to start the conversation.</span>
        </div>
    )
}

export function TeamChatLoadingMessage() {
    return (
        <div className="thread-msg thread-msg--assistant" data-scrollable>
            <div className="assistant-body">
                <TextShimmer text="Thinking" active />
            </div>
        </div>
    )
}
