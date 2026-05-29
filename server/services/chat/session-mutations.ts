import type {
    ChatRevertRequest,
    ChatSessionRevertResponse,
    ChatSessionUnrevertResponse,
    ChatSessionUpdateResponse,
    ChatSummarizeResponse,
} from '../../../shared/chat-contracts.js'
import { waitForSessionToSettle } from '../../lib/chat-session.js'
import { getOpencode } from '../../lib/opencode.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { syncTeamParticipantStatusForSession } from '../team-runtime/team-session-runtime.js'
import { directoryQueryForSession } from './session-directory.js'
import { normalizeRevertState } from './session-normalizers.js'
import {
    deleteSessionOwnership,
    resolveSessionOwnership,
    setSessionSidebarTitle,
} from './session-ownership-service.js'

export async function deleteStudioChatSession(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult(await oc.session.delete({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    await deleteSessionOwnership(sessionId)
    return { ok: true as const }
}

export async function renameStudioChatSession(
    workingDir: string,
    sessionId: string,
    title: string,
): Promise<ChatSessionUpdateResponse> {
    const ownership = await resolveSessionOwnership(sessionId)
    if (ownership?.ownerKind === 'agent') {
        await setSessionSidebarTitle(sessionId, title)
        return {
            ok: true as const,
            title,
            sidebarTitle: title,
        }
    }

    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const updated = unwrapOpencodeResult<Record<string, unknown>>(await oc.session.update({
        sessionID: sessionId,
        ...directoryQuery,
        title,
    }))
    return {
        ok: true,
        title: typeof updated?.title === 'string' ? updated.title : title,
    }
}

export async function abortStudioChatSession(workingDir: string, sessionId: string) {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult(await oc.session.abort({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    await waitForSessionToSettle(oc, sessionId, directoryQuery).catch(() => {})
    await syncTeamParticipantStatusForSession(sessionId, { type: 'idle' }).catch(() => {})
    return { ok: true as const }
}

export async function summarizeStudioChatSession(
    workingDir: string,
    sessionId: string,
    options: { providerId?: string; modelId?: string; auto?: boolean },
): Promise<ChatSummarizeResponse> {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const summarized = unwrapOpencodeResult<boolean>(await oc.session.summarize({
        sessionID: sessionId,
        ...directoryQuery,
        ...(options.providerId && options.modelId ? { providerID: options.providerId, modelID: options.modelId } : {}),
        ...(typeof options.auto === 'boolean' ? { auto: options.auto } : {}),
    }))
    return { ok: true, summarized }
}

export async function revertStudioChatSession(
    workingDir: string,
    sessionId: string,
    input: ChatRevertRequest,
): Promise<ChatSessionRevertResponse> {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    const data = unwrapOpencodeResult<unknown>(await oc.session.revert({
        sessionID: sessionId,
        ...directoryQuery,
        messageID: input.messageId,
        ...(input.partId ? { partID: input.partId } : {}),
    }))
    const revert = normalizeRevertState(data)
    return {
        ok: true,
        ...(revert ? { revert } : {}),
    }
}

export async function unrevertStudioChatSession(workingDir: string, sessionId: string): Promise<ChatSessionUnrevertResponse> {
    const oc = await getOpencode()
    const directoryQuery = await directoryQueryForSession(workingDir, sessionId)
    unwrapOpencodeResult<unknown>(await oc.session.unrevert({
        sessionID: sessionId,
        ...directoryQuery,
    }))
    return { ok: true }
}
