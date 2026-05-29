import type { ChatMessage } from '../../store/session/chat-message-types'
/**
 * TeamChatPanel - Thread-based participant chat for a Team surface.
 *
 * Choreography model: each Thread has independent participant sessions.
 * User interacts with individual participants via tabs.
 * Wake-up prompts are visually distinguished from user input.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import { hasModelConfig } from '../../lib/agents'
import { useChatSession } from '../../store/session/use-chat-session'

import { resolveTeamParticipantLabel } from './participant-labels'
import { evaluateTeamReadiness } from './team-readiness'
import { usePermissionInteraction } from '../../hooks/usePermissionInteraction'
import { resolveDisplayedTeamThread } from '../../lib/team-threads'
import { resizeTextarea } from '../../lib/textarea-autosize'
import {
    buildActiveTeamParticipantChatKey,
    buildTeamChatComposerState,
    buildTeamParticipantExecutionStates,
    buildTeamParticipantLoadingStates,
    resolveActiveTeamParticipantKey,
    resolveTeamParticipantAgent,
} from './team-chat-panel-helpers'
import { TeamChatComposer } from './TeamChatComposer'
import {
    TeamChatEmptyState,
    TeamChatLoadingMessage,
    TeamChatMessage,
} from './TeamChatThreadRenderers'
import TeamChatThreadSurface from './TeamChatThreadSurface'
import '../agent/AgentChat.css'
import '../agent/AgentChatComposer.css'
import './TeamChatPanel.css'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_THREADS: never[] = []

interface TeamChatPanelProps {
    teamId: string
}

export default function TeamChatPanel({ teamId }: TeamChatPanelProps) {
    const {
        teams, agents, sendTeamMessage, abortChat,
        teamThreads, activeThreadId, activeThreadParticipantKey,
        selectThreadParticipant, openTeamEditor, createThread, selectThread, loadThreads, reorderTeamParticipants,
        respondToPermission, respondToQuestion, rejectQuestion,
    } = useStudioStore(useShallow((state) => ({
        teams: state.teams,
        agents: state.agents,
        sendTeamMessage: state.sendTeamMessage,
        abortChat: state.abortChat,
        teamThreads: state.teamThreads,
        activeThreadId: state.activeThreadId,
        activeThreadParticipantKey: state.activeThreadParticipantKey,
        selectThreadParticipant: state.selectThreadParticipant,
        openTeamEditor: state.openTeamEditor,
        createThread: state.createThread,
        selectThread: state.selectThread,
        loadThreads: state.loadThreads,
        reorderTeamParticipants: state.reorderTeamParticipants,
        respondToPermission: state.respondToPermission,
        respondToQuestion: state.respondToQuestion,
        rejectQuestion: state.rejectQuestion,
    })))
    const sessionLoadingById = useStudioStore((state) => state.sessionLoading)
    const sessionStatusesById = useStudioStore((state) => state.seStatuses)
    const sessionMessagesById = useStudioStore((state) => state.seMessages)
    const sessionPermissionsById = useStudioStore((state) => state.sePermissions)
    const sessionQuestionsById = useStudioStore((state) => state.seQuestions)

    const team = useMemo(() => teams.find((a) => a.id === teamId), [teams, teamId])
    const [input, setInput] = useState('')
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const [isCreatingThread, setIsCreatingThread] = useState(false)

    // Readiness evaluation
    const readiness = useMemo(
        () => team ? evaluateTeamReadiness(team, agents) : { runnable: false, issues: [] },
        [team, agents],
    )

    // Thread state
    const threads = useMemo(() => teamThreads[teamId] || EMPTY_THREADS, [teamId, teamThreads])
    const currentThread = useMemo(
        () => resolveDisplayedTeamThread(threads, activeThreadId),
        [activeThreadId, threads],
    )

    useEffect(() => {
        void loadThreads(teamId)
    }, [teamId, loadThreads])

    const participantKeys = useMemo(() => team ? Object.keys(team.participants) : [], [team])
    const { isCallboardView, activeParticipantKey } = useMemo(
        () => resolveActiveTeamParticipantKey(participantKeys, currentThread?.id || null, activeThreadParticipantKey),
        [participantKeys, currentThread, activeThreadParticipantKey],
    )
    const chatKey = useMemo(
        () => buildActiveTeamParticipantChatKey(teamId, currentThread?.id || null, activeParticipantKey),
        [teamId, currentThread, activeParticipantKey],
    )

    const chatSession = useChatSession(chatKey)
    const messages: ChatMessage[] = chatSession.messages || EMPTY_MESSAGES
    const isLoading = chatSession.isLoading
    const canAbort = chatSession.canAbort
    const sessionId = chatSession.sessionId
    const teamTodos = chatSession.todos
    const permissionRequest = chatSession.permission
    const questionRequest = chatSession.question
    const setSessionTodos = useStudioStore((state) => state.setSessionTodos)
    const hasPendingPermission = !!permissionRequest
    const isTodoLive = isLoading || hasPendingPermission

    const {
        isResponding: isRespondingToPermission,
        permissionRequest: activePermissionRequest,
        questionRequest: activeQuestionRequest,
        handlePermissionDecide,
        handleQuestionRespond,
        handleQuestionReject,
    } = usePermissionInteraction({
        sessionId,
        permissionRequest,
        questionRequest,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
    })

    const handleTodoClear = useCallback(() => {
        if (!sessionId) return
        setSessionTodos(sessionId, [])
    }, [sessionId, setSessionTodos])

    const activeParticipantLabel = useMemo(
        () => activeParticipantKey
            ? resolveTeamParticipantLabel(team, activeParticipantKey, agents)
            : null,
        [team, activeParticipantKey, agents],
    )
    const executionStatesByParticipant = useMemo(
        () => buildTeamParticipantExecutionStates({
            currentThread,
            participantKeys,
            sessionLoadingById,
            sessionStatusesById,
            sessionMessagesById,
            sessionPermissionsById,
            sessionQuestionsById,
        }),
        [
            currentThread,
            participantKeys,
            sessionLoadingById,
            sessionStatusesById,
            sessionMessagesById,
            sessionPermissionsById,
            sessionQuestionsById,
        ],
    )
    const participantLoadingStates = useMemo(() => {
        return buildTeamParticipantLoadingStates({
            currentThread,
            participantKeys,
            executionStatesByParticipant,
        })
    }, [
        currentThread,
        participantKeys,
        executionStatesByParticipant,
    ])

    // Resolve agent model from ref binding
    const resolvedAgent = useMemo(
        () => resolveTeamParticipantAgent(team, activeParticipantKey, agents),
        [team, activeParticipantKey, agents],
    )
    const modelConfigured = hasModelConfig(resolvedAgent?.model || null)

    const handleCreateThread = useCallback(async () => {
        if (!readiness.runnable || isCreatingThread) return
        setIsCreatingThread(true)
        try {
            const threadId = await createThread(teamId)
            selectThread(teamId, threadId)
        } finally {
            setIsCreatingThread(false)
        }
    }, [readiness.runnable, isCreatingThread, createThread, teamId, selectThread])

    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading || !currentThread || !activeParticipantKey || !modelConfigured) return
        const text = input.trim()
        setInput('')
        await sendTeamMessage(teamId, currentThread.id, activeParticipantKey, text)
    }, [input, isLoading, currentThread, activeParticipantKey, modelConfigured, sendTeamMessage, teamId])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void handleSend()
        }
    }, [handleSend])

    const noParticipants = participantKeys.length === 0
    const {
        composerDisabled,
        sendDisabled,
        inputPlaceholder,
    } = useMemo(() => buildTeamChatComposerState({
        input,
        noParticipants,
        readinessRunnable: readiness.runnable,
        hasCurrentThread: !!currentThread,
        modelConfigured,
        isLoading,
        activeParticipantLabel,
        activeParticipantKey,
    }), [
        activeParticipantKey,
        activeParticipantLabel,
        currentThread,
        input,
        isLoading,
        modelConfigured,
        noParticipants,
        readiness.runnable,
    ])

    useEffect(() => {
        resizeTextarea(inputRef.current)
    }, [input])

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)
        resizeTextarea(e.target)
    }, [])

    const handleAbort = useCallback(() => {
        if (!chatKey) return
        void abortChat(chatKey)
    }, [abortChat, chatKey])

    const renderMessage = useCallback((msg: ChatMessage, index: number) => {
        return <TeamChatMessage key={msg.id || index} message={msg} index={index} messages={messages} isLoading={isLoading} />
    }, [isLoading, messages])

    const renderEmpty = useCallback(() => (
        <TeamChatEmptyState
            noParticipants={noParticipants}
            readiness={readiness}
            hasCurrentThread={!!currentThread}
            modelConfigured={modelConfigured}
            activeParticipantLabel={activeParticipantLabel}
            activeParticipantKey={activeParticipantKey}
            isCreatingThread={isCreatingThread}
            onCreateThread={() => void handleCreateThread()}
            onEditTeam={() => openTeamEditor(teamId, 'team')}
        />
    ), [
        teamId,
        activeParticipantKey,
        activeParticipantLabel,
        currentThread,
        handleCreateThread,
        isCreatingThread,
        modelConfigured,
        noParticipants,
        openTeamEditor,
        readiness,
    ])

    const renderLoading = useCallback(() => (
        <TeamChatLoadingMessage />
    ), [])

    const composer = useMemo(() => (
        <TeamChatComposer
            input={input}
            inputRef={inputRef}
            inputPlaceholder={inputPlaceholder}
            composerDisabled={composerDisabled}
            sendDisabled={sendDisabled}
            canAbort={canAbort}
            todos={teamTodos}
            isTodoLive={isTodoLive}
            permissionRequest={activePermissionRequest}
            questionRequest={activeQuestionRequest}
            isRespondingToPermission={isRespondingToPermission}
            onInputChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onSend={() => void handleSend()}
            onAbort={handleAbort}
            onTodoClear={handleTodoClear}
            onPermissionDecide={handlePermissionDecide}
            onQuestionRespond={handleQuestionRespond}
            onQuestionReject={handleQuestionReject}
        />
    ), [
        teamTodos,
        activePermissionRequest,
        activeQuestionRequest,
        canAbort,
        composerDisabled,
        handleAbort,
        handleInputChange,
        handleKeyDown,
        handlePermissionDecide,
        handleQuestionReject,
        handleQuestionRespond,
        handleSend,
        handleTodoClear,
        input,
        inputPlaceholder,
        isRespondingToPermission,
        isTodoLive,
        sendDisabled,
    ])

    if (!team) return null

    return (
        <div className="team-chat">
            <TeamChatThreadSurface
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
                messages={messages}
                isLoading={isLoading}
                chatKey={chatKey}
                renderMessage={renderMessage}
                renderEmpty={renderEmpty}
                renderLoading={renderLoading}
                composer={composer}
            />
        </div>
    )
}
