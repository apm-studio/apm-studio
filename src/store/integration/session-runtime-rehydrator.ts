import type {
    ChatPermissionRequest,
    ChatQuestionRequest,
    ChatTodo,
} from '../../../shared/chat-contracts'
import type { StudioState } from '../types'
import type {
    SessionScopedRequest,
    SessionStatusSnapshot,
} from './realtime-event-helpers'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

type SessionSyncRehydration = {
    keepRequestsForKnownOrResolvableSessions: <T extends SessionScopedRequest>(requests: T[]) => Promise<T[]>
    reconcileRehydratedSessions: (sessionIds: Iterable<string>) => void
}

type SessionRuntimeRehydratorInput = {
    get: GetState
    set: SetState
    sessionSync: SessionSyncRehydration
    listPendingPermissions: () => Promise<ChatPermissionRequest[]>
    listPendingQuestions: () => Promise<ChatQuestionRequest[]>
    status: (sessionId: string) => Promise<{ status: SessionStatusSnapshot | null }>
    todos: (sessionId: string) => Promise<ChatTodo[]>
}

export function createSessionRuntimeRehydrator(input: SessionRuntimeRehydratorInput) {
    const {
        get,
        set,
        sessionSync,
        listPendingPermissions,
        listPendingQuestions,
        status,
        todos,
    } = input

    return async function rehydrateSessionRuntimeState() {
        const [permissionsResult, questionsResult] = await Promise.all([
            listPendingPermissions().catch(() => null),
            listPendingQuestions().catch(() => null),
        ])

        const permissions = permissionsResult
            ? await sessionSync.keepRequestsForKnownOrResolvableSessions(permissionsResult)
            : null
        const questions = questionsResult
            ? await sessionSync.keepRequestsForKnownOrResolvableSessions(questionsResult)
            : null

        const sessionIds = new Set<string>(Object.keys(get().sessionToChatKey))
        for (const permission of permissions || []) {
            if (permission.sessionId) {
                sessionIds.add(permission.sessionId)
            }
        }
        for (const question of questions || []) {
            if (question.sessionId) {
                sessionIds.add(question.sessionId)
            }
        }

        const statusEntries = await Promise.all(Array.from(sessionIds, async (sessionId) => {
            try {
                const result = await status(sessionId)
                return { sessionId, status: result.status, ok: true }
            } catch {
                return { sessionId, status: null, ok: false }
            }
        }))
        const todoEntries = await Promise.all(Array.from(sessionIds, async (sessionId) => {
            try {
                return { sessionId, todos: await todos(sessionId), ok: true }
            } catch {
                return { sessionId, todos: [], ok: false }
            }
        }))

        set((state) => {
            const next: Partial<StudioState> = {}

            if (permissions) {
                next.sePermissions = Object.fromEntries(
                    permissions.map((permission) => [permission.sessionId, permission]),
                ) as StudioState['sePermissions']
            }

            if (questions) {
                next.seQuestions = Object.fromEntries(
                    questions.map((question) => [question.sessionId, question]),
                ) as StudioState['seQuestions']
            }

            const nextStatuses = { ...state.seStatuses }
            for (const entry of statusEntries) {
                if (!entry.ok) {
                    continue
                }
                if (entry.status) {
                    nextStatuses[entry.sessionId] = entry.status
                } else {
                    delete nextStatuses[entry.sessionId]
                }
            }
            next.seStatuses = nextStatuses

            const nextTodos = { ...state.seTodos }
            for (const entry of todoEntries) {
                if (!entry.ok) {
                    continue
                }
                if (entry.todos.length > 0) {
                    nextTodos[entry.sessionId] = entry.todos
                } else {
                    delete nextTodos[entry.sessionId]
                }
            }
            next.seTodos = nextTodos

            return next
        })

        sessionSync.reconcileRehydratedSessions(sessionIds)
    }
}
