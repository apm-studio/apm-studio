import type {
    ChatPermissionRequest,
    ChatQuestionAnswer,
    ChatQuestionRequest,
    ChatTodo,
} from '../../../shared/chat-contracts.js'
import {
    normalizeChatPermissionRequests,
    normalizeChatQuestionRequests,
    normalizeChatTodos,
} from '../../../shared/chat-interactions.js'
import { getOpencode } from '../../lib/opencode.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { responseData } from '../opencode/service.js'
import { listSessionOwnershipsForWorkingDir } from './session-ownership-service.js'
import { directoryQueryForSession } from './session-directory.js'

type SessionScopedRequest = {
    sessionId: string
}

async function filterRequestsForWorkingDir<T extends SessionScopedRequest>(workingDir: string, requests: T[]): Promise<T[]> {
    const ownerships = await listSessionOwnershipsForWorkingDir(workingDir)
    const sessionIds = new Set(ownerships.map((ownership) => ownership.sessionId))
    return requests.filter((request) => sessionIds.has(request.sessionId))
}

export async function respondSessionPermission(workingDir: string, sessionId: string, permissionId: string, response: 'once' | 'always' | 'reject') {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult(await oc.permission.reply({
        ...directoryQuery,
        requestID: permissionId,
        reply: response,
    }))
    return { ok: true as const }
}

export async function respondQuestion(workingDir: string, questionId: string, answers: ChatQuestionAnswer[]) {
    const oc = await getOpencode()
    unwrapOpencodeResult(await oc.question.reply({
        directory: workingDir,
        requestID: questionId,
        answers,
    }))
    return { ok: true as const }
}

export async function rejectQuestion(workingDir: string, questionId: string) {
    const oc = await getOpencode()
    unwrapOpencodeResult(await oc.question.reject({
        directory: workingDir,
        requestID: questionId,
    }))
    return { ok: true as const }
}

export async function listPendingPermissions(workingDir: string): Promise<ChatPermissionRequest[]> {
    const oc = await getOpencode()
    const res = await oc.permission.list({ directory: workingDir })
    return filterRequestsForWorkingDir(workingDir, normalizeChatPermissionRequests(responseData<unknown>(res, [])))
}

export async function listPendingQuestions(workingDir: string): Promise<ChatQuestionRequest[]> {
    const oc = await getOpencode()
    const res = await oc.question.list({ directory: workingDir })
    return filterRequestsForWorkingDir(workingDir, normalizeChatQuestionRequests(responseData<unknown>(res, [])))
}

export async function listStudioSessionTodos(workingDir: string, sessionId: string): Promise<ChatTodo[]> {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    return normalizeChatTodos(unwrapOpencodeResult<unknown>(await oc.session.todo({
        sessionID: sessionId,
        ...directoryQuery,
    })))
}
