import { Hono } from 'hono'
import type {
    TeamBoardEntriesResponse,
    TeamBoardEntryResponse,
    TeamDefinition,
    TeamMessageTeammateRequest,
    TeamPostToBoardResponse,
    TeamPostToBoardRequest,
    TeamRuntimeErrorResponse,
    TeamSendMessageRequest,
    TeamSendMessageResponse,
    TeamSetWakeConditionRequest,
    TeamUpdateSharedBoardRequest,
    TeamWakeConditionResponse,
    TeamWaitUntilRequest,
    TeamWritableBoardKind,
} from '../../../shared/team-types.js'
import { serverDebug } from '../../lib/server-logger.js'
import { resolveTeamSessionTarget } from '../../services/team-runtime/team-session-runtime.js'
import { getTeamDefinitionForThread, getTeamRuntimeService } from '../../services/team-runtime/team-runtime-service.js'
import {
    isTeamSessionWaitUntilParked,
    parkTeamSessionUntilSettled,
} from '../../services/team-runtime/wait-until-session-park.js'
import { teamRuntimeError } from '../../services/team-runtime/team-runtime-results.js'
import { requestWorkingDir } from '../route-errors.js'
import { jsonTeamRuntimeError } from './route-errors.js'

const teamRuntimeTools = new Hono()

export function resolveParticipantRecipient(
    teamDefinition: TeamDefinition | null | undefined,
    senderKey: string,
    recipient: string,
) {
    const canMessageParticipant = (participantKey: string) => {
        if (!teamDefinition) {
            return true
        }

        return Object.values(teamDefinition.relations || []).some((relation) => {
            const [left, right] = relation.between
            if (relation.direction === 'one-way') {
                return left === senderKey && right === participantKey
            }
            return (
                (left === senderKey && right === participantKey)
                || (left === participantKey && right === senderKey)
            )
        })
    }

    const normalizedRecipient = recipient.trim().toLowerCase()
    if (!normalizedRecipient) {
        return null
    }

    if (!teamDefinition) {
        return recipient
    }

    for (const [participantKey, binding] of Object.entries(teamDefinition.participants || {})) {
        const displayName = (binding.displayName || participantKey).trim().toLowerCase()
        if (
            canMessageParticipant(participantKey)
            && (displayName === normalizedRecipient || participantKey.toLowerCase() === normalizedRecipient)
        ) {
            return participantKey
        }
    }

    return null
}

async function resolveParticipantKeyByName(
    workingDir: string,
    threadId: string,
    senderKey: string,
    recipient: string,
) {
    const teamDefinition = await getTeamDefinitionForThread(workingDir, threadId)
    return resolveParticipantRecipient(teamDefinition, senderKey, recipient)
}

function parkedToolError(toolName: string) {
    return teamRuntimeError(
        `wait_until already parked this turn. End the current turn and wait for resume before calling ${toolName}.`,
        409,
    )
}

function teamSessionNotFound(): TeamRuntimeErrorResponse {
    return teamRuntimeError('Team session not found', 404)
}

teamRuntimeTools.use('/api/team/*', async (c, next) => {
    const url = c.req.url
    const method = c.req.method
    const workingDir = c.req.query('workingDir') || c.req.header('x-apm-working-dir') || 'NONE'
    serverDebug('team-tool-req', `${method} ${url.replace(/\?.*/, '')} workingDir=${decodeURIComponent(workingDir).slice(-40)}`)
    await next()
})

teamRuntimeTools.post('/api/team/:teamId/thread/:threadId/send-message', async (c) => {
    const threadId = c.req.param('threadId')
    const workingDir = requestWorkingDir(c)
    serverDebug('team-tool', `send-message threadId=${threadId} workingDir=${workingDir}`)
    const body = await c.req.json<TeamSendMessageRequest>()

    const service = getTeamRuntimeService(workingDir)
    const result = await service.sendMessage(threadId, body)
    serverDebug('team-tool', `send-message result ok=${result.ok}${!result.ok ? ` error=${result.error}` : ''}`)
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamSendMessageResponse)
})

teamRuntimeTools.get('/api/team/session/:sessionId/list-shared-board', async (c) => {
    const target = await resolveTeamSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return jsonTeamRuntimeError(c, teamSessionNotFound())
    }
    if (isTeamSessionWaitUntilParked(target.sessionId)) {
        const error = parkedToolError('list_shared_board')
        return jsonTeamRuntimeError(c, error)
    }

    const kindRaw = c.req.query('kind')
    const kind: TeamWritableBoardKind | undefined = kindRaw === 'artifact' || kindRaw === 'finding' || kindRaw === 'task'
        ? kindRaw satisfies TeamWritableBoardKind
        : undefined
    const summaryOnly = c.req.query('summaryOnly') !== 'false'
    const limitRaw = c.req.query('limit')
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined
    const result = await getTeamRuntimeService(target.workingDir).listBoard(target.threadId, { kind, summaryOnly, limit })
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamBoardEntriesResponse)
})

teamRuntimeTools.get('/api/team/session/:sessionId/get-shared-board-entry', async (c) => {
    const target = await resolveTeamSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return jsonTeamRuntimeError(c, teamSessionNotFound())
    }
    if (isTeamSessionWaitUntilParked(target.sessionId)) {
        const error = parkedToolError('get_shared_board_entry')
        return jsonTeamRuntimeError(c, error)
    }

    const key = c.req.query('key')
    const result = await getTeamRuntimeService(target.workingDir).getBoardEntry(target.threadId, key || '')
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamBoardEntryResponse)
})

teamRuntimeTools.post('/api/team/session/:sessionId/message-teammate', async (c) => {
    const target = await resolveTeamSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return jsonTeamRuntimeError(c, teamSessionNotFound())
    }
    if (isTeamSessionWaitUntilParked(target.sessionId)) {
        const error = parkedToolError('message_teammate')
        return jsonTeamRuntimeError(c, error)
    }

    const body = await c.req.json<TeamMessageTeammateRequest>()

    const recipientKey = await resolveParticipantKeyByName(
        target.workingDir,
        target.threadId,
        target.participantKey,
        body.recipient,
    )
    if (!recipientKey) {
        return jsonTeamRuntimeError(c, teamRuntimeError(`Unknown teammate "${body.recipient}"`, 400))
    }

    const result = await getTeamRuntimeService(target.workingDir).sendMessage(target.threadId, {
        from: target.participantKey,
        to: recipientKey,
        content: body.message,
        tag: body.tag,
    })
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamSendMessageResponse)
})

teamRuntimeTools.post('/api/team/:teamId/thread/:threadId/post-to-board', async (c) => {
    const threadId = c.req.param('threadId')
    const workingDir = requestWorkingDir(c)
    serverDebug('team-tool', `post-to-board threadId=${threadId} workingDir=${workingDir}`)
    const body = await c.req.json<TeamPostToBoardRequest>()

    const result = await getTeamRuntimeService(workingDir).postToBoard(threadId, body)
    serverDebug('team-tool', `post-to-board result ok=${result.ok}${!result.ok ? ` error=${result.error}` : ''}`)
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamPostToBoardResponse)
})

teamRuntimeTools.post('/api/team/session/:sessionId/update-shared-board', async (c) => {
    const target = await resolveTeamSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return jsonTeamRuntimeError(c, teamSessionNotFound())
    }
    if (isTeamSessionWaitUntilParked(target.sessionId)) {
        const error = parkedToolError('update_shared_board')
        return jsonTeamRuntimeError(c, error)
    }

    const body = await c.req.json<TeamUpdateSharedBoardRequest>()

    const result = await getTeamRuntimeService(target.workingDir).postToBoard(target.threadId, {
        author: target.participantKey,
        key: body.entryKey,
        kind: body.entryType,
        content: body.content,
        updateMode: body.mode,
    })
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamPostToBoardResponse)
})

teamRuntimeTools.get('/api/team/:teamId/thread/:threadId/read-board', async (c) => {
    const threadId = c.req.param('threadId')
    const workingDir = requestWorkingDir(c)
    serverDebug('team-tool', `read-board threadId=${threadId} workingDir=${workingDir}`)
    const key = c.req.query('key')
    const summaryOnly = c.req.query('summaryOnly') !== 'false'
    const limitRaw = c.req.query('limit')
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined
    const result = await getTeamRuntimeService(workingDir).readBoard(threadId, { key, summaryOnly, limit })
    serverDebug('team-tool', `read-board result ok=${result.ok}${!result.ok ? ` error=${result.error}` : ''}`)
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamBoardEntriesResponse)
})

teamRuntimeTools.post('/api/team/:teamId/thread/:threadId/set-wake-condition', async (c) => {
    const threadId = c.req.param('threadId')
    const body = await c.req.json<TeamSetWakeConditionRequest>()

    const result = await getTeamRuntimeService(requestWorkingDir(c)).setWakeCondition(threadId, body)
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    return c.json(result satisfies TeamWakeConditionResponse)
})

teamRuntimeTools.post('/api/team/session/:sessionId/wait-until', async (c) => {
    const target = await resolveTeamSessionTarget(c.req.param('sessionId'))
    if (!target) {
        return jsonTeamRuntimeError(c, teamSessionNotFound())
    }

    const body = await c.req.json<TeamWaitUntilRequest>()

    const result = await getTeamRuntimeService(target.workingDir).setWakeCondition(target.threadId, {
        createdBy: target.participantKey,
        target: 'self',
        onSatisfiedMessage: body.resumeWith,
        condition: body.condition,
    })
    if (!result.ok) {
        return jsonTeamRuntimeError(c, result)
    }
    parkTeamSessionUntilSettled(target.sessionId, target.workingDir)
    return c.json(result satisfies TeamWakeConditionResponse)
})

export default teamRuntimeTools
