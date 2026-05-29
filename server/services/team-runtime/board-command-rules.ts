import type {
    BoardEntry,
    TeamPostToBoardRequest,
    TeamRuntimeErrorResponse,
} from '../../../shared/team-types.js'
import {
    BOARD_APPEND_MAX_CHARS,
    BOARD_ENTRY_MAX_CHARS,
} from './board-limits.js'
import type { SafetyGuard } from './safety-guard.js'
import { teamRuntimeError } from './team-runtime-results.js'

export type PreparedBoardPost = {
    key: string
    content: string
    updateMode: 'replace' | 'append'
}

export function prepareBoardPost(params: {
    body: TeamPostToBoardRequest
    guard: SafetyGuard
    readExistingEntry: (key: string) => BoardEntry | null | undefined
}): { ok: true; value: PreparedBoardPost } | { ok: false; error: TeamRuntimeErrorResponse } {
    const { body, guard, readExistingEntry } = params
    const key = body.key.trim()
    const content = body.content.trim()
    const updateMode = body.updateMode || 'replace'

    if (!key) {
        return { ok: false, error: teamRuntimeError('Shared note key is required', 400) }
    }
    if (!content) {
        return { ok: false, error: teamRuntimeError('Shared note content is required', 400) }
    }

    const boardCheck = guard.checkBoardUpdateBudget(key)
    if (!boardCheck.ok) {
        return { ok: false, error: teamRuntimeError(boardCheck.reason, 429) }
    }

    const existingEntry = readExistingEntry(key)
    if (existingEntry) {
        const writePolicyCheck = guard.checkBoardWritePolicy(existingEntry, body.author)
        if (!writePolicyCheck.ok) {
            return { ok: false, error: teamRuntimeError(writePolicyCheck.reason, 403) }
        }
    }

    if (content.length > BOARD_ENTRY_MAX_CHARS) {
        return {
            ok: false,
            error: teamRuntimeError(`Shared note content must be ${BOARD_ENTRY_MAX_CHARS} characters or less`, 400),
        }
    }

    if (updateMode === 'append') {
        if (content.length > BOARD_APPEND_MAX_CHARS) {
            return {
                ok: false,
                error: teamRuntimeError(`Append updates must be ${BOARD_APPEND_MAX_CHARS} characters or less`, 400),
            }
        }
        if (existingEntry && `${existingEntry.content}\n${content}`.length > BOARD_ENTRY_MAX_CHARS) {
            return {
                ok: false,
                error: teamRuntimeError(
                    'Append update would exceed the shared note size limit. Replace the entry with a compact summary instead.',
                    400,
                ),
            }
        }
    }

    return {
        ok: true,
        value: {
            key,
            content,
            updateMode,
        },
    }
}
