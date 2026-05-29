import type { PrimitiveCard, DraftPrimitive } from '../../lib/primitive-types'
import type { ChatMessage } from '../../store/session/chat-message-types'
import type { WorkspaceAgentNode } from '../../../shared/workspace-contracts'
/**
 * AgentChatPanel — chat shell for agent conversation.
 *
 * Responsibilities:
 * - wire store actions to the agent thread view
 * - host composer state hook
 * - manage revert confirmation modal
 */
import { useCallback, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'

import RevertConfirmModal from '../../components/chat/RevertConfirmModal'
import AgentChatComposer from './AgentChatComposer'
import AgentThreadView from './AgentThreadView'
import { useAgentChatComposerState } from './useAgentChatComposerState'
import { selectPendingPermission, selectPendingQuestion } from '../../store/session'

type AgentChatPanelProps = {
    agentId: string
    agent: WorkspaceAgentNode | null
    messages: ChatMessage[]
    prefixCount: number
    isLoading: boolean
    canAbort: boolean
    sessionId: string | null
    hasActiveSession: boolean
    modelConfigured: boolean
    selectedAgentId: string
    buildAgent: { name: string; description?: string } | null
    planAgent: { name: string; description?: string } | null
    runtimeTools: {
        resolvedTools: string[]
        selectedMcpServers: string[]
        unavailableDetails: Array<{ serverName: string; reason: string }>
    } | null
    skillPrimitives: PrimitiveCard[]
    drafts: Record<string, DraftPrimitive>
    onSetAgentId: (id: string, agentId: string | null) => void
    onSetModelVariant: (id: string, variant: string | null) => void
    showModeToggle?: boolean
}

export default function AgentChatPanel({
    agentId,
    agent,
    messages,
    prefixCount,
    isLoading,
    canAbort,
    sessionId,
    hasActiveSession,
    modelConfigured,
    selectedAgentId,
    buildAgent,
    planAgent,
    runtimeTools,
    skillPrimitives,
    drafts,
    onSetAgentId,
    onSetModelVariant,
    showModeToggle = true,
}: AgentChatPanelProps) {
    const {
        abortChat,
        revertSession,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
    } = useStudioStore(useShallow((state) => ({
        abortChat: state.abortChat,
        revertSession: state.revertSession,
        respondToPermission: state.respondToPermission,
        respondToQuestion: state.respondToQuestion,
        rejectQuestion: state.rejectQuestion,
    })))

    const [revertTarget, setRevertTarget] = useState<{ agentId: string; messageId: string; messageContent: string } | null>(null)
    const [isRevertConfirming, setIsRevertConfirming] = useState(false)
    const composerState = useAgentChatComposerState({
        agentId,
        agent,
        modelConfigured,
        isLoading,
        runtimeTools,
        skillPrimitives,
        drafts,
    })
    const permissionRequest = useStudioStore((state) => (
        sessionId ? selectPendingPermission(state, sessionId) : null
    ))
    const questionRequest = useStudioStore((state) => (
        sessionId ? selectPendingQuestion(state, sessionId) : null
    ))
    const handleOpenRevert = useCallback((pid: string, mid: string, content: string) => {
        setRevertTarget({ agentId: pid, messageId: mid, messageContent: content })
    }, [])

    return (
        <>
            <AgentThreadView
                agentId={agentId}
                messages={messages}
                prefixCount={prefixCount}
                isLoading={isLoading}
                hasActiveSession={hasActiveSession}
                onOpenRevert={handleOpenRevert}
                composer={(
                    <AgentChatComposer
                        agentId={agentId}
                        agent={agent}
                        input={composerState.input}
                        setInput={composerState.setInput}
                        isLoading={isLoading}
                        canAbort={canAbort}
                        modelConfigured={modelConfigured}
                        sessionId={sessionId}
                        selectedAgentId={selectedAgentId}
                        buildAgent={buildAgent}
                        planAgent={planAgent}
                        attachments={composerState.attachments}
                        setAttachments={composerState.setAttachments}
                        turnSkillSelections={composerState.turnSkillSelections}
                        setTurnSkillSelections={composerState.setTurnSkillSelections}
                        inputRef={composerState.inputRef}
                        handleDrop={composerState.handleDrop}
                        handlePaste={composerState.handlePaste}
                        handleInputChange={composerState.handleInputChange}
                        handleKeyDownWrapper={composerState.handleKeyDownWrapper}
                        handleSend={composerState.handleSend}
                        abortChat={abortChat}
                        skillSlashMatch={composerState.skillSlashMatch}
                        skillSearchSections={composerState.skillSearchSections}
                        skillSearchResults={composerState.skillSearchResults}
                        skillSearchIndex={composerState.skillSearchIndex}
                        addTurnSkillSelection={composerState.addTurnSkillSelection}
                        showSlashMenu={composerState.showSlashMenu}
                        slashIndex={composerState.slashIndex}
                        filteredCommands={composerState.filteredCommands}
                        applySelectedCommand={composerState.applySelectedCommand}
                        isFileMentioning={composerState.isFileMentioning}
                        fileMentionResults={composerState.fileMentionResults}
                        fileMentionIndex={composerState.fileMentionIndex}
                        extractFileMentionText={composerState.extractFileMentionText}
                        setFileMentionIndex={composerState.setFileMentionIndex}
                        setIsFileMentioning={composerState.setIsFileMentioning}
                        checkFileMention={composerState.checkFileMention}
                        permissionRequest={permissionRequest}
                        questionRequest={questionRequest}
                        respondToPermission={respondToPermission}
                        respondToQuestion={respondToQuestion}
                        rejectQuestion={rejectQuestion}
                        onSetAgentId={onSetAgentId}
                        onSetModelVariant={onSetModelVariant}
                        showModeToggle={showModeToggle}
                    />
                )}
            />
            {revertTarget ? (
                <RevertConfirmModal
                    messagePreview={revertTarget.messageContent}
                    submitting={isRevertConfirming}
                    onConfirm={async () => {
                        const content = revertTarget.messageContent
                        setIsRevertConfirming(true)
                        try {
                            await revertSession(revertTarget.agentId, revertTarget.messageId)
                            setRevertTarget(null)
                            composerState.setInput(content)
                            setTimeout(() => composerState.composerInputRef.current?.focus(), 50)
                        } finally {
                            setIsRevertConfirming(false)
                        }
                    }}
                    onCancel={() => {
                        if (isRevertConfirming) return
                        setRevertTarget(null)
                    }}
                />
            ) : null}
        </>
    )
}
