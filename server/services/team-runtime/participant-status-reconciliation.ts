import type { ChatSessionStatus } from '../../../shared/chat-contracts.js'
import { normalizeChatSessionMessages } from '../../../shared/chat-session-message.js'
import { normalizeChatSessionStatusMap } from '../../../shared/chat-session-status.js'
import {
    isSessionStatusActive,
    resolveEffectiveSessionStatus,
} from '../../lib/chat-session.js'
import { getOpencode } from '../../lib/opencode.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { serverDebug } from '../../lib/server-logger.js'
import type { TeamRuntimeActorSystem } from './team-runtime-actors.js'
import type { ThreadManager } from './thread-manager.js'

type ParticipantStatusActorControls = Pick<TeamRuntimeActorSystem, 'syncParticipantStatus'>

export async function reconcileLoadedParticipantStatuses(params: {
    workingDir: string
    threadManager: ThreadManager
    actorSystem: ParticipantStatusActorControls
}) {
    const { workingDir, threadManager, actorSystem } = params
    const oc = await getOpencode()
    let statuses: Record<string, ChatSessionStatus> = {}

    try {
        statuses = normalizeChatSessionStatusMap(unwrapOpencodeResult<unknown>(await oc.session.status({
            directory: workingDir,
        })))
    } catch {
        statuses = {}
    }

    for (const threadId of threadManager.listLoadedThreadIds()) {
        const runtime = threadManager.getThreadRuntime(threadId)
        if (!runtime) {
            continue
        }

        for (const [participantKey, sessionId] of Object.entries(runtime.thread.participantSessions || {})) {
            const persistedStatus = runtime.thread.participantStatuses?.[participantKey]
            if (persistedStatus?.type !== 'busy' && persistedStatus?.type !== 'retry') {
                continue
            }

            const reconciled = await resolveLoadedParticipantSessionStatus({
                oc,
                workingDir,
                statuses,
                sessionId,
            })
            if (!reconciled || reconciled.type === persistedStatus.type) {
                continue
            }

            serverDebug(
                'team-runtime',
                `Reconciled stale participant status for "${participantKey}" in thread ${threadId}: ${persistedStatus.type} -> ${reconciled.type}`,
            )
            await threadManager.setParticipantStatus(threadId, participantKey, reconciled)
            actorSystem.syncParticipantStatus(threadId, participantKey, {
                ...reconciled,
                updatedAt: Date.now(),
            })
        }
    }
}

async function resolveLoadedParticipantSessionStatus(params: {
    oc: Awaited<ReturnType<typeof getOpencode>>
    workingDir: string
    statuses: Record<string, ChatSessionStatus>
    sessionId: string
}): Promise<{ type: 'idle' | 'busy' | 'retry' | 'error'; message?: string } | null> {
    const { oc, workingDir, statuses, sessionId } = params
    const direct = statuses[sessionId]
    if (direct?.type === 'idle' || direct?.type === 'error') {
        return { type: direct.type }
    }

    const shouldInspectMessages = !direct?.type || isSessionStatusActive(direct)
    if (!shouldInspectMessages) {
        return direct?.type ? { type: direct.type } : null
    }

    try {
        const rawMessages = normalizeChatSessionMessages(unwrapOpencodeResult<unknown>(await oc.session.messages({
            directory: workingDir,
            sessionID: sessionId,
        })))
        const effectiveStatus = resolveEffectiveSessionStatus({
            directStatus: direct,
            messages: rawMessages,
        })
        return effectiveStatus?.type ? { type: effectiveStatus.type } : null
    } catch {
        // If message inspection fails, keep the authoritative direct status.
    }

    return direct?.type ? { type: direct.type } : null
}
