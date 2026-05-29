import type { WorkspaceAgentNode } from '../../../shared/workspace-contracts'
import type { RefObject } from 'react'
import type { ChatPermissionRequest, ChatQuestionAnswer, ChatQuestionRequest } from '../../../shared/chat-contracts'
import { Send, Square } from 'lucide-react'
import type { FileMention } from '../../hooks/useFileMentions'
import type { TurnSkillSelection, SkillSearchItem } from './agent-frame-utils'
import { resizeTextarea } from '../../lib/textarea-autosize'
import ComposerPillBar from './ComposerPillBar'
import ComposerMentionMenus from './ComposerMentionMenus'
import ComposerRuntimeRow from './ComposerRuntimeRow'
import PermissionDock from './PermissionDock'
import QuestionWizard from './QuestionWizard'
import { usePermissionInteraction } from '../../hooks/usePermissionInteraction'

type Props = {
    agentId: string
    agent: WorkspaceAgentNode | null
    input: string
    setInput: (value: string) => void
    isLoading: boolean
    canAbort: boolean
    modelConfigured: boolean
    sessionId: string | null
    selectedAgentId: string
    buildAgent: { name: string; description?: string } | null
    planAgent: { name: string; description?: string } | null
    attachments: FileMention[]
    setAttachments: React.Dispatch<React.SetStateAction<FileMention[]>>
    turnSkillSelections: TurnSkillSelection[]
    setTurnSkillSelections: React.Dispatch<React.SetStateAction<TurnSkillSelection[]>>
    inputRef: RefObject<HTMLTextAreaElement | null>
    handleDrop: (e: React.DragEvent) => void
    handlePaste: (e: React.ClipboardEvent) => void
    handleInputChange: (value: string) => void
    handleKeyDownWrapper: (e: React.KeyboardEvent) => void
    handleSend: () => void
    abortChat: (agentId: string) => void
    skillSlashMatch: string | null
    skillSearchSections: Array<{ key: string; title: string; items: SkillSearchItem[] }>
    skillSearchResults: SkillSearchItem[]
    skillSearchIndex: number
    addTurnSkillSelection: (item: SkillSearchItem) => void
    showSlashMenu: boolean
    slashIndex: number
    filteredCommands: Array<{ cmd: string; desc: string; mode: 'compose' }>
    applySelectedCommand: (command: string) => void
    isFileMentioning: boolean
    fileMentionResults: FileMention[]
    fileMentionIndex: number
    extractFileMentionText: () => string | null
    setFileMentionIndex: React.Dispatch<React.SetStateAction<number>>
    setIsFileMentioning: (value: boolean) => void
    checkFileMention: () => void
    permissionRequest: ChatPermissionRequest | null
    questionRequest: ChatQuestionRequest | null
    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
    respondToQuestion: (sessionId: string, questionId: string, answers: ChatQuestionAnswer[]) => Promise<void>
    rejectQuestion: (sessionId: string, questionId: string) => Promise<void>
    onSetAgentId: (id: string, agentId: string | null) => void
    onSetModelVariant: (id: string, variant: string | null) => void
    showModeToggle?: boolean
}

export default function AgentChatComposer(props: Props) {
    const {
        agentId,
        agent,
        input,
        setInput,
        canAbort,
        modelConfigured,
        sessionId,
        selectedAgentId,
        buildAgent,
        planAgent,
        attachments,
        setAttachments,
        turnSkillSelections,
        setTurnSkillSelections,
        inputRef,
        handleDrop,
        handlePaste,
        handleInputChange,
        handleKeyDownWrapper,
        handleSend,
        abortChat,
        skillSlashMatch,
        skillSearchSections,
        skillSearchResults,
        skillSearchIndex,
        addTurnSkillSelection,
        showSlashMenu,
        slashIndex,
        filteredCommands,
        applySelectedCommand,
        isFileMentioning,
        fileMentionResults,
        fileMentionIndex,
        extractFileMentionText,
        checkFileMention,
        permissionRequest,
        questionRequest,
        respondToPermission,
        respondToQuestion,
        rejectQuestion,
        onSetAgentId,
        onSetModelVariant,
        showModeToggle = true,
    } = props

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

    const isPlanAgent = selectedAgentId === 'plan'

    return (
        <div
            className="chat-input"
            style={{ position: 'relative' }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
        >
            <ComposerPillBar
                turnSkillSelections={turnSkillSelections}
                setTurnSkillSelections={setTurnSkillSelections}
                attachments={attachments}
                setAttachments={setAttachments}
            />

            <ComposerMentionMenus
                input={input}
                setInput={setInput}
                inputRef={inputRef}
                isFileMentioning={isFileMentioning}
                fileMentionResults={fileMentionResults}
                fileMentionIndex={fileMentionIndex}
                extractFileMentionText={extractFileMentionText}
                setAttachments={setAttachments}
                skillSlashMatch={skillSlashMatch}
                skillSearchSections={skillSearchSections}
                skillSearchResults={skillSearchResults}
                skillSearchIndex={skillSearchIndex}
                addTurnSkillSelection={addTurnSkillSelection}
                showSlashMenu={showSlashMenu}
                slashIndex={slashIndex}
                filteredCommands={filteredCommands}
                applySelectedCommand={applySelectedCommand}
            />

            {activePermissionRequest ? (
                <PermissionDock
                    request={activePermissionRequest}
                    responding={isRespondingToPermission}
                    onDecide={handlePermissionDecide}
                />
            ) : null}

            {activeQuestionRequest ? (
                <QuestionWizard
                    key={activeQuestionRequest.id}
                    request={activeQuestionRequest}
                    responding={isRespondingToPermission}
                    onRespond={handleQuestionRespond}
                    onReject={handleQuestionReject}
                />
            ) : null}

            <div className="chat-input__main">
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                        handleInputChange(e.target.value)
                        resizeTextarea(e.target)
                    }}
                    onKeyUp={() => { checkFileMention() }}
                    onMouseUp={() => { checkFileMention() }}
                    onKeyDown={handleKeyDownWrapper}
                    onPaste={handlePaste}
                    placeholder={!modelConfigured
                        ? 'Select a model before chatting'
                        : isPlanAgent
                            ? 'Plan mode — ask for a plan...'
                            : 'Message... (# files, / for Skills)'}
                    rows={1}
                    className="text-input"
                />
                {canAbort ? (
                    <button className="send-btn abort" onClick={() => abortChat(agentId)} title="Abort generation">
                        <Square size={12} fill="currentColor" />
                    </button>
                ) : (
                    <button className="send-btn" onClick={handleSend} disabled={!input.trim() || !modelConfigured || skillSlashMatch !== null}>
                        <Send size={12} />
                    </button>
                )}
            </div>

            <ComposerRuntimeRow
                agentId={agentId}
                agent={agent}
                selectedAgentId={selectedAgentId}
                buildAgent={buildAgent}
                planAgent={planAgent}
                onSetAgentId={onSetAgentId}
                onSetModelVariant={onSetModelVariant}
                showModeToggle={showModeToggle}
            />
        </div>
    )
}
