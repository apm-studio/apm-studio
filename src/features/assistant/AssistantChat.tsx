import {
    useState,
    useRef,
    useEffect,
    useCallback,
    useMemo,
    type KeyboardEvent,
    type MouseEvent as ReactMouseEvent,
} from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import { useModels } from '../../hooks/queries/opencode'
import { buildAssistantChatKey } from '../../store/assistant/slice'
import { showToast } from '../../lib/toast'
import { resizeTextarea } from '../../lib/textarea-autosize'
import { useChatSession } from '../../store/session/use-chat-session'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { useAssistantModels } from './useAssistantModels'
import { useAssistantToolApplication } from './useAssistantToolApplication'
import AssistantComposer from './AssistantComposer'
import AssistantPanelHeader from './AssistantPanelHeader'
import { AssistantEmptyPrompt, AssistantModelMissingState } from './AssistantEmptyStates'
import {
    buildAssistantActionStatusView,
    groupAssistantModelsByProvider,
    resolveAssistantModelLabel,
    resolveAssistantStatusLabel,
} from './assistant-chat-model'

// Reuse agent chat rendering components
import ThreadBody from '../chat/ThreadBody'
import ChatMessageContent from '../chat/ChatMessageContent'
import {
    hasVisibleAssistantMessageContent,
    hasVisibleUserMessageContent,
    isStreamingAssistantMessage,
    shouldShowAssistantLoadingPlaceholder,
} from '../chat/chat-message-visibility'

import '../agent/AgentChat.css'
import './AssistantChat.css'

export function AssistantChat() {
    const {
        isAssistantOpen,
        assistantModel,
        appliedAssistantActionMessageIds,
        assistantActionResults,
        sendMessage,
        abortChat,
        startNewSession,
        toggleAssistant,
        setAssistantModel,
        setAssistantAvailableModels,
        markAssistantActionsApplied,
        recordAssistantActionResult,
        initRealtimeEvents,
    } = useStudioStore(useShallow((state) => ({
        isAssistantOpen: state.isAssistantOpen,
        assistantModel: state.assistantModel,
        appliedAssistantActionMessageIds: state.appliedAssistantActionMessageIds,
        assistantActionResults: state.assistantActionResults,
        sendMessage: state.sendMessage,
        abortChat: state.abortChat,
        startNewSession: state.startNewSession,
        toggleAssistant: state.toggleAssistant,
        setAssistantModel: state.setAssistantModel,
        setAssistantAvailableModels: state.setAssistantAvailableModels,
        markAssistantActionsApplied: state.markAssistantActionsApplied,
        recordAssistantActionResult: state.recordAssistantActionResult,
        initRealtimeEvents: state.initRealtimeEvents,
    })))

    const workingDir = useStudioStore((state) => state.workingDir)
    const assistantChatKey = useMemo(() => buildAssistantChatKey(workingDir), [workingDir])
    const chatSession = useChatSession(assistantChatKey)
    const { messages, isLoading, canAbort, activityKind, sessionId, status: sessionStatus } = chatSession

    const { data: models } = useModels()
    const {
        connectedModels,
        hasModels,
        selectedConnectedModel,
    } = useAssistantModels({
        models,
        assistantModel,
        setAssistantModel,
        setAssistantAvailableModels,
    })

    const [input, setInput] = useState('')
    const [panelWidth, setPanelWidth] = useState(320)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const dragging = useRef(false)

    useAssistantToolApplication({
        messages,
        appliedAssistantActionMessageIds,
        markAssistantActionsApplied,
        recordAssistantActionResult,
    })

    // Resize handle
    const onResizeMouseDown = useCallback((e: ReactMouseEvent) => {
        e.preventDefault()
        dragging.current = true
        const startX = e.clientX
        const startW = panelWidth
        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return
            setPanelWidth(Math.min(520, Math.max(260, startW + (startX - ev.clientX))))
        }
        const onUp = () => {
            dragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [panelWidth])

    useEffect(() => {
        resizeTextarea(textareaRef.current, 150)
    }, [input])

    const handleSend = useCallback(() => {
        const trimmed = input.trim()
        if (!trimmed || !assistantModel || isLoading) return
        initRealtimeEvents()
        sendMessage(assistantChatKey, trimmed)
        setInput('')
    }, [assistantChatKey, assistantModel, initRealtimeEvents, input, isLoading, sendMessage])

    const handleRefreshSession = useCallback(async () => {
        if (!hasModels || isLoading) return
        await startNewSession(assistantChatKey)
        setInput('')

        showToast(
            'Assistant session refreshed.',
            'success',
            {
                title: 'APM Assistant',
                dedupeKey: 'assistant:refresh-session',
            },
        )
    }, [assistantChatKey, hasModels, isLoading, startNewSession])

    const openSettings = useCallback(() => {
        document.querySelector<HTMLButtonElement>('[title="Settings"]')?.click()
    }, [])

    const currentModelLabel = useMemo(
        () => resolveAssistantModelLabel(assistantModel, selectedConnectedModel),
        [assistantModel, selectedConnectedModel],
    )

    const groupedModels = useMemo(() => (
        groupAssistantModelsByProvider(connectedModels)
    ), [connectedModels])

    const statusLabel = useMemo(() => resolveAssistantStatusLabel({
        isLoading,
        activityKind,
        sessionId,
        sessionStatusType: sessionStatus?.type,
    }), [activityKind, isLoading, sessionId, sessionStatus?.type])

    const handleInputKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }, [handleSend])

    const renderAssistantActionStatus = useCallback((messageId: string) => {
        const result = assistantActionResults[messageId]
        const status = buildAssistantActionStatusView(result)
        if (!status) return null

        return (
            <div className={`assistant-action-status ${status.toneClass}`}>
                {status.label}
            </div>
        )
    }, [assistantActionResults])

    const renderEmpty = useCallback(() => (
        <AssistantEmptyPrompt />
    ), [])

    const renderMessage = useCallback((msg: typeof messages[number], index: number) => {
        const isStreamingAssistant = isStreamingAssistantMessage(messages, index, isLoading)
        if (msg.role === 'user' && !hasVisibleUserMessageContent(msg)) {
            return null
        }
        if (msg.role === 'assistant' && !hasVisibleAssistantMessageContent(msg)) {
            return null
        }
        return (
            <div key={msg.id} className={`thread-msg thread-msg--${msg.role}`} data-scrollable>
                {msg.role === 'user' ? (
                    <div className="user-input-box">
                        <span className="user-input-text">{msg.content}</span>
                    </div>
                ) : (
                    <>
                        <ChatMessageContent message={msg} streaming={isStreamingAssistant} />
                        {renderAssistantActionStatus(msg.id)}
                    </>
                )}
            </div>
        )
    }, [isLoading, messages, renderAssistantActionStatus])

    const renderLoading = useCallback(() => (
        <div className="thread-msg thread-msg--assistant" data-scrollable>
            <div className="assistant-body">
                <TextShimmer text="Thinking" active />
            </div>
        </div>
    ), [])

    const composer = useMemo(() => (
        <AssistantComposer
            textareaRef={textareaRef}
            input={input}
            isLoading={isLoading}
            canAbort={canAbort}
            assistantModel={assistantModel}
            currentModelLabel={currentModelLabel}
            groupedModels={groupedModels}
            onInputChange={setInput}
            onKeyDown={handleInputKeyDown}
            onSend={handleSend}
            onAbort={() => void abortChat(assistantChatKey)}
            onModelChange={setAssistantModel}
        />
    ), [
        abortChat,
        assistantChatKey,
        assistantModel,
        canAbort,
        currentModelLabel,
        groupedModels,
        handleInputKeyDown,
        handleSend,
        input,
        isLoading,
        setAssistantModel,
    ])

    if (!isAssistantOpen) return null

    return (
        <div className="assistant-panel" style={{ width: panelWidth }}>
            <div className="assistant-resize-handle" onMouseDown={onResizeMouseDown} />

            <AssistantPanelHeader
                currentModelLabel={currentModelLabel}
                statusLabel={statusLabel}
                isLoading={isLoading}
                hasModels={hasModels}
                onRefreshSession={handleRefreshSession}
                onToggleAssistant={toggleAssistant}
            />

            {!hasModels ? (
                <AssistantModelMissingState onOpenSettings={openSettings} />
            ) : (
                <ThreadBody
                    messages={messages}
                    loading={shouldShowAssistantLoadingPlaceholder(messages, isLoading)}
                    scrollStateKey={assistantChatKey}
                    historyClassName="assistant-content"
                    renderEmpty={renderEmpty}
                    renderMessage={renderMessage}
                    renderLoading={renderLoading}
                    composer={composer}
                />
            )}
        </div>
    )
}
