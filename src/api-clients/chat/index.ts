import type {
    ChatPermissionRequest,
    ChatQuestionAnswer,
    ChatQuestionRequest,
    ChatOkResponse,
    ChatPendingPermissionsResponse,
    ChatPendingQuestionsResponse,
    ChatQuestionRespondRequest,
    ChatRevertRequest,
    ChatSendRequest,
    ChatSendResponse,
    ChatSessionCreateResponse,
    ChatSessionListResponse,
    ChatSessionDiffResponse,
    ChatSessionMessagesResponse,
    ChatSessionPermissionReply,
    ChatSessionPermissionRespondRequest,
    ChatSessionRevertResponse,
    ChatSessionResolveResponse,
    ChatSessionStatusResponse,
    ChatSessionTodosResponse,
    ChatSessionUnrevertResponse,
    ChatSessionUpdateRequest,
    ChatSessionUpdateResponse,
    ChatSummarizeRequest,
    ChatSummarizeResponse,
} from '../../../shared/chat-contracts'
import { createApiEventSource, deleteJSON, fetchJSON, postJSON, putJSON } from '../../api-core'

export const chatApi = {
    createSession: (agentId: string, agentName: string, configHash: string, teamId?: string) =>
        postJSON<ChatSessionCreateResponse>('/api/chat/sessions', { agentId, agentName, configHash, teamId }),

    deleteSession: (id: string) =>
        deleteJSON<ChatOkResponse>(`/api/chat/sessions/${id}`),

    updateSession: (id: string, title: string) =>
        putJSON<ChatSessionUpdateResponse>(
            `/api/chat/sessions/${id}`,
            { title } satisfies ChatSessionUpdateRequest,
        ),

    send: (
        id: string,
        payload: ChatSendRequest,
    ) =>
        postJSON<ChatSendResponse>(`/api/chat/sessions/${id}/send`, payload satisfies ChatSendRequest),

    status: (id: string) =>
        fetchJSON<ChatSessionStatusResponse>(`/api/chat/sessions/${id}/status`),

    todos: (id: string) =>
        fetchJSON<ChatSessionTodosResponse>(`/api/chat/sessions/${id}/todos`).then((response) => response.todos),

    abort: (id: string) =>
        postJSON<ChatOkResponse>(`/api/chat/sessions/${id}/abort`),

    messages: async (id: string, options?: { limit?: number; before?: string }): Promise<ChatSessionMessagesResponse> => {
        const params = new URLSearchParams()
        if (typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
            params.set('limit', String(options.limit))
        }
        if (typeof options?.before === 'string' && options.before.trim()) {
            params.set('before', options.before.trim())
        }
        const query = params.toString()
        return fetchJSON<ChatSessionMessagesResponse>(`/api/chat/sessions/${id}/messages${query ? `?${query}` : ''}`)
    },

    diff: (id: string) =>
        fetchJSON<ChatSessionDiffResponse>(`/api/chat/sessions/${id}/diff`)
            .then((response) => response.diffs),

    summarize: (
        id: string,
        payload?: ChatSummarizeRequest,
    ) =>
        postJSON<ChatSummarizeResponse>(`/api/chat/sessions/${id}/summarize`, (payload || {}) satisfies ChatSummarizeRequest),

    revert: (id: string, messageId: string, partId?: string) =>
        postJSON<ChatSessionRevertResponse>(
            `/api/chat/sessions/${id}/revert`,
            { messageId, partId } satisfies ChatRevertRequest,
        ),

    unrevert: (id: string) =>
        postJSON<ChatSessionUnrevertResponse>(`/api/chat/sessions/${id}/unrevert`),

    list: () =>
        fetchJSON<ChatSessionListResponse>('/api/chat/sessions')
            .then((response) => response.sessions),

    events: () => createApiEventSource('/api/chat/events'),

    resolveSession: (id: string) =>
        fetchJSON<ChatSessionResolveResponse>(`/api/chat/sessions/${id}/resolve`),

    respondPermission: (sessionId: string, permissionId: string, response: ChatSessionPermissionReply) =>
        postJSON<ChatOkResponse>(
            `/api/chat/sessions/${sessionId}/permission/${permissionId}/respond`,
            { response } satisfies ChatSessionPermissionRespondRequest,
        ),

    listPendingPermissions: () =>
        fetchJSON<ChatPendingPermissionsResponse>('/api/chat/permissions')
            .then((response): ChatPermissionRequest[] => response.permissions),

    listPendingQuestions: () =>
        fetchJSON<ChatPendingQuestionsResponse>('/api/chat/questions')
            .then((response): ChatQuestionRequest[] => response.questions),

    respondQuestion: (questionId: string, answers: ChatQuestionAnswer[]) =>
        postJSON<ChatOkResponse>(
            `/api/chat/questions/${questionId}/respond`,
            { answers } satisfies ChatQuestionRespondRequest,
        ),

    rejectQuestion: (questionId: string) =>
        postJSON<ChatOkResponse>(`/api/chat/questions/${questionId}/reject`),
}
