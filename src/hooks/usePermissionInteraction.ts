/**
 * usePermissionInteraction — shared hook for PermissionDock / QuestionWizard rendering.
 *
 * Encapsulates the "isResponding" local state and the decision callbacks
 * that are duplicated between AgentChatComposer and TeamChatPanel.
 */
import { useState, useCallback } from 'react'
import type { ChatPermissionRequest, ChatQuestionAnswer, ChatQuestionRequest } from '../../shared/chat-contracts'

interface UsePermissionInteractionParams {
    sessionId: string | null
    permissionRequest: ChatPermissionRequest | null
    questionRequest: ChatQuestionRequest | null
    respondToPermission: (sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>
    respondToQuestion: (sessionId: string, questionId: string, answers: ChatQuestionAnswer[]) => Promise<void>
    rejectQuestion: (sessionId: string, questionId: string) => Promise<void>
}

export function usePermissionInteraction({
    sessionId,
    permissionRequest,
    questionRequest,
    respondToPermission,
    respondToQuestion,
    rejectQuestion,
}: UsePermissionInteractionParams) {
    const [isResponding, setIsResponding] = useState(false)

    const handlePermissionDecide = useCallback(async (response: 'once' | 'always' | 'reject') => {
        if (!sessionId || !permissionRequest) return
        setIsResponding(true)
        await respondToPermission(sessionId, permissionRequest.id, response)
        setIsResponding(false)
    }, [sessionId, permissionRequest, respondToPermission])

    const handleQuestionRespond = useCallback(async (answers: ChatQuestionAnswer[]) => {
        if (!sessionId || !questionRequest) return
        setIsResponding(true)
        await respondToQuestion(sessionId, questionRequest.id, answers)
        setIsResponding(false)
    }, [sessionId, questionRequest, respondToQuestion])

    const handleQuestionReject = useCallback(async () => {
        if (!sessionId || !questionRequest) return
        setIsResponding(true)
        await rejectQuestion(sessionId, questionRequest.id)
        setIsResponding(false)
    }, [sessionId, questionRequest, rejectQuestion])

    return {
        isResponding,
        permissionRequest,
        questionRequest,
        handlePermissionDecide,
        handleQuestionRespond,
        handleQuestionReject,
    }
}
