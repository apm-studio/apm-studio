import type { ChangeEventHandler, KeyboardEventHandler, RefObject } from 'react'
import { Send, Square } from 'lucide-react'

import type { ChatPermissionRequest, ChatQuestionAnswer, ChatQuestionRequest, ChatTodo } from '../../../shared/chat-contracts'
import { TodoDock } from '../../components/chat/TodoDock'
import PermissionDock from '../agent/PermissionDock'
import QuestionWizard from '../agent/QuestionWizard'

type TeamChatComposerProps = {
    input: string
    inputRef: RefObject<HTMLTextAreaElement | null>
    inputPlaceholder: string
    composerDisabled: boolean
    sendDisabled: boolean
    canAbort: boolean
    todos: ChatTodo[]
    isTodoLive: boolean
    permissionRequest: ChatPermissionRequest | null
    questionRequest: ChatQuestionRequest | null
    isRespondingToPermission: boolean
    onInputChange: ChangeEventHandler<HTMLTextAreaElement>
    onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
    onSend: () => void
    onAbort: () => void
    onTodoClear: () => void
    onPermissionDecide: (response: 'once' | 'always' | 'reject') => void
    onQuestionRespond: (answers: ChatQuestionAnswer[]) => void
    onQuestionReject: () => void
}

export function TeamChatComposer({
    input,
    inputRef,
    inputPlaceholder,
    composerDisabled,
    sendDisabled,
    canAbort,
    todos,
    isTodoLive,
    permissionRequest,
    questionRequest,
    isRespondingToPermission,
    onInputChange,
    onKeyDown,
    onSend,
    onAbort,
    onTodoClear,
    onPermissionDecide,
    onQuestionRespond,
    onQuestionReject,
}: TeamChatComposerProps) {
    return (
        <>
            <TodoDock todos={todos} isLive={isTodoLive} onClear={onTodoClear} />
            <div className="chat-input">
                <div className="chat-input__main">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={onInputChange}
                        onKeyDown={onKeyDown}
                        placeholder={inputPlaceholder}
                        rows={1}
                        disabled={composerDisabled}
                        className="text-input"
                    />
                    {canAbort ? (
                        <button className="send-btn abort" onClick={onAbort} title="Abort generation">
                            <Square size={12} fill="currentColor" />
                        </button>
                    ) : (
                        <button className="send-btn" onClick={onSend} disabled={sendDisabled}>
                            <Send size={12} />
                        </button>
                    )}
                </div>

                {permissionRequest ? (
                    <PermissionDock
                        request={permissionRequest}
                        responding={isRespondingToPermission}
                        onDecide={onPermissionDecide}
                    />
                ) : null}

                {questionRequest ? (
                    <QuestionWizard
                        key={questionRequest.id}
                        request={questionRequest}
                        responding={isRespondingToPermission}
                        onRespond={onQuestionRespond}
                        onReject={onQuestionReject}
                    />
                ) : null}
            </div>
        </>
    )
}
