import { nanoid } from 'nanoid'
import type {
    MailboxEvent,
    TeamBoardEntriesResponse,
    TeamBoardEntryResponse,
    TeamListBoardRequest,
    TeamPostToBoardRequest,
    TeamPostToBoardResponse,
    TeamReadBoardRequest,
    TeamRuntimeErrorResponse,
} from '../../../shared/team-types.js'
import type { SafetyGuard } from './safety-guard.js'
import type { ThreadManager } from './thread-manager.js'
import type { WakeCascadeDispatcher } from './wake-cascade-dispatcher.js'
import {
    normalizeBoardReadLimit,
    summarizeBoardEntry,
} from './board-limits.js'
import { prepareBoardPost } from './board-command-rules.js'
import { teamRuntimeError } from './team-runtime-results.js'

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error'
}

export async function postTeamRuntimeBoardEntry(params: {
    threadId: string
    body: TeamPostToBoardRequest
    threadManager: ThreadManager
    wakeCascadeDispatcher: WakeCascadeDispatcher
    getSafetyGuard: (threadId: string) => SafetyGuard
}): Promise<TeamPostToBoardResponse | TeamRuntimeErrorResponse> {
    const {
        threadId,
        body,
        threadManager,
        wakeCascadeDispatcher,
        getSafetyGuard,
    } = params
    const runtime = threadManager.getThreadRuntime(threadId)
    if (!runtime) {
        return teamRuntimeError(`Thread ${threadId} not found`, 404)
    }

    const guard = getSafetyGuard(threadId)
    const timeoutCheck = guard.checkTimeout(runtime.thread)
    if (!timeoutCheck.ok) {
        return teamRuntimeError(timeoutCheck.reason, 429)
    }

    const preparedPost = prepareBoardPost({
        body,
        guard,
        readExistingEntry: (key) => runtime.mailbox.readBoard(key),
    })
    if (!preparedPost.ok) {
        return preparedPost.error
    }
    const { key, content, updateMode } = preparedPost.value

    try {
        const entry = runtime.mailbox.postToBoard({
            key,
            kind: body.kind,
            author: body.author,
            content,
            updateMode,
            ownership: 'authoritative',
            metadata: body.metadata,
            threadId,
        })

        await threadManager.persistBoard(threadId)

        const eventType = entry.version > 1 ? 'board.updated' : 'board.posted'
        const event: MailboxEvent = {
            id: nanoid(),
            type: eventType,
            sourceType: 'agent',
            source: body.author,
            timestamp: Date.now(),
            payload: { key, kind: body.kind, author: body.author, threadId },
        }
        await threadManager.logEvent(threadId, event)

        const teamDefinition = threadManager.getTeamDefinition(threadId)
        if (teamDefinition) {
            wakeCascadeDispatcher.dispatch({
                threadId,
                event,
                teamDefinition,
                mailbox: runtime.mailbox,
                source: 'postToBoard',
            })
        }

        return { ok: true as const, entryId: entry.id, version: entry.version }
    } catch (error: unknown) {
        return teamRuntimeError(errorMessage(error), 403)
    }
}

export async function listTeamRuntimeBoardEntries(params: {
    threadId: string
    input?: TeamListBoardRequest
    threadManager: ThreadManager
}): Promise<TeamBoardEntriesResponse | TeamRuntimeErrorResponse> {
    const input = params.input || {}
    const runtime = params.threadManager.getThreadRuntime(params.threadId)
    if (!runtime) {
        return teamRuntimeError(`Thread ${params.threadId} not found`, 404)
    }

    const entries = runtime.mailbox.getBoardSnapshot()
        .filter((entry) => (input.kind ? entry.kind === input.kind : true))
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, normalizeBoardReadLimit(input.limit))

    return {
        ok: true as const,
        entries: input.summaryOnly === false ? entries : entries.map((entry) => summarizeBoardEntry(entry)),
    }
}

export async function getTeamRuntimeBoardEntry(params: {
    threadId: string
    key: string
    threadManager: ThreadManager
}): Promise<TeamBoardEntryResponse | TeamRuntimeErrorResponse> {
    const runtime = params.threadManager.getThreadRuntime(params.threadId)
    if (!runtime) {
        return teamRuntimeError(`Thread ${params.threadId} not found`, 404)
    }

    const normalizedKey = params.key.trim()
    if (!normalizedKey) {
        return teamRuntimeError('Shared note key is required', 400)
    }

    const entry = runtime.mailbox.readBoard(normalizedKey)
    if (!entry) {
        return teamRuntimeError(`Shared note "${normalizedKey}" not found`, 404)
    }

    return { ok: true as const, entry }
}

export async function readTeamRuntimeBoard(params: {
    threadId: string
    input?: TeamReadBoardRequest
    threadManager: ThreadManager
}): Promise<TeamBoardEntriesResponse | TeamRuntimeErrorResponse> {
    const input = params.input || {}
    const runtime = params.threadManager.getThreadRuntime(params.threadId)
    if (!runtime) {
        return teamRuntimeError(`Thread ${params.threadId} not found`, 404)
    }

    const key = input.key?.trim()
    if (key) {
        const entry = runtime.mailbox.readBoard(key)
        return { ok: true as const, entries: entry ? [entry] : [] }
    }

    return listTeamRuntimeBoardEntries({
        threadId: params.threadId,
        input: { limit: input.limit, summaryOnly: input.summaryOnly },
        threadManager: params.threadManager,
    })
}
