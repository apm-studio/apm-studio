import { getOpencode } from '../../lib/opencode.js'
import { isSessionEffectivelyRunning, isSessionStatusActive } from '../../lib/chat-session.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { clearProjectionRuntimePending } from '../opencode-projection/projection-manifest.js'
import { normalizeChatSessionMessages } from '../../../shared/chat-session-message.js'
import { normalizeChatSessionStatusMap } from '../../../shared/chat-session-status.js'
import type { ChatSessionStatus } from '../../../shared/chat-contracts.js'

type OpenCodeSessionSummary = {
    id: string
}

function normalizeSessionSummaries(value: unknown): OpenCodeSessionSummary[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null
            }
            const id = (entry as { id?: unknown }).id
            return typeof id === 'string' ? { id } : null
        })
        .filter((entry): entry is OpenCodeSessionSummary => entry !== null)
}

async function isSessionCountedAsRunning(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    directory: string,
    sessionId: string,
    status: ChatSessionStatus | undefined,
) {
    if (!isSessionStatusActive(status)) {
        return false
    }

    try {
        const rawMessages = normalizeChatSessionMessages(unwrapOpencodeResult<unknown>(await oc.session.messages({
            directory,
            sessionID: sessionId,
        })))
        return isSessionEffectivelyRunning({ directStatus: status, messages: rawMessages })
    } catch {
        // If message inspection fails, fall back to the authoritative busy/retry status.
    }

    return true
}

export async function countRunningSessions(workingDir: string) {
    const oc = await getOpencode()
    const directories = [workingDir]

    let runningSessions = 0

    for (const directory of directories) {
        let sessions: OpenCodeSessionSummary[] = []
        let statuses: Record<string, ChatSessionStatus> = {}

        try {
            sessions = normalizeSessionSummaries(unwrapOpencodeResult<unknown>(await oc.session.list({ directory })))
        } catch {
            sessions = []
        }

        try {
            statuses = normalizeChatSessionStatusMap(unwrapOpencodeResult<unknown>(await oc.session.status({ directory })))
        } catch {
            statuses = {}
        }

        for (const session of sessions) {
            if (!session?.id) {
                continue
            }
            const status = statuses?.[session.id]
            if (await isSessionCountedAsRunning(oc, directory, session.id, status)) {
                runningSessions += 1
            }
        }
    }

    return { oc, directories, runningSessions }
}

export async function applyStudioRuntimeReload(workingDir: string) {
    const { oc, directories, runningSessions } = await countRunningSessions(workingDir)

    if (runningSessions > 0) {
        return {
            applied: false,
            blocked: true,
            runningSessions,
            disposedDirectories: [] as string[],
        }
    }

    for (const directory of directories) {
        await oc.instance.dispose({ directory }).catch(() => {})
        await clearProjectionRuntimePending(directory).catch(() => {})
    }

    return {
        applied: true,
        blocked: false,
        runningSessions: 0,
        disposedDirectories: directories,
    }
}
