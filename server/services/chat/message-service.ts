import { getOpencode } from '../../lib/opencode.js'
import { buildStudioSessionTitle } from '../../../shared/session-metadata.js'
import type { ChatSendRequest, ChatSessionCreateRequest } from '../../../shared/chat-contracts.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { retryOnAgentRegistryMiss } from '../../lib/opencode-prompt.js'
import { resolveTeamSessionPolicy } from '../../lib/team-session-policy.js'
import {
    parseTeamParticipantSessionOwner,
    registerTeamParticipantSession,
} from '../team-runtime/team-session-runtime.js'
import { ensureTeamToolFiles } from '../team-runtime/team-tool-files.js'
import { getTeamRuntimeService } from '../team-runtime/team-runtime-service.js'
import { countRunningSessions } from '../runtime/reload-service.js'
import { createSessionOwnership } from './session-ownership-service.js'
import {
    beginTeamTurn,
    scheduleTeamTurnSettlement,
    syncTeamParticipantSessionFailure,
} from './team-turn-lifecycle.js'
import { prepareTeamTurnProjection } from './team-turn-projection.js'
import {
    scheduleGeneratedChatThreadTitle,
    seedInitialChatThreadTitle,
} from './thread-title-execution.js'
import { joinPromptSections } from './turn-prompt-service.js'
import { buildChatPromptParts } from './chat-prompt-parts.js'
import { prepareChatPromptRuntime } from './chat-prompt-runtime.js'

export async function createStudioChatSession(
    cwd: string,
    request: ChatSessionCreateRequest,
) {
    const oc = await getOpencode()
    const isTeamSession = !!request.teamId
    const teamPolicy = isTeamSession ? resolveTeamSessionPolicy(request.teamId!) : null
    const ownerKind = isTeamSession ? teamPolicy!.ownerKind : 'agent' as const
    // Use the full chatKey as the session context owner so each
    // Team participant session resolves back to the correct tab and execution scope.
    const contextOwnerId = request.agentId
    const session = unwrapOpencodeResult<{ id: string; title: string }>(await oc.session.create({
        directory: cwd,
        title: buildStudioSessionTitle(request.agentId, request.agentName, request.configHash),
    }))
    await createSessionOwnership({
        sessionId: session.id,
        ownerKind,
        ownerId: contextOwnerId,
        workingDir: cwd,
    })

    if (request.teamId) {
        try {
            await registerTeamParticipantSession(cwd, contextOwnerId, session.id)
        } catch {
            // Non-fatal: session still works, just won't persist for reload.
        }
    }

    return {
        sessionId: session.id,
        title: session.title,
    }
}

export async function sendStudioChatMessage(
    workingDir: string,
    sessionId: string,
    request: ChatSendRequest,
) {
    const agent = request.agent
    const teamSessionOwner = request.teamId
        ? parseTeamParticipantSessionOwner(agent.agentId)
        : null
    const rawAgentId = teamSessionOwner?.participantKey || agent.agentId

    const {
        teamSystemPrompt,
        projectionAgentId,
        projectionAgentName,
    } = await prepareTeamTurnProjection({
        workingDir,
        request,
        rawAgentId,
    })

    const promptRuntime = await prepareChatPromptRuntime({
        workingDir,
        request,
        rawAgentId,
        projectionAgentId,
        projectionAgentName,
    })
    const parts = buildChatPromptParts(request, promptRuntime.capabilitySnapshot)

    const oc = await getOpencode()
    const teamRuntime = request.teamId && request.teamThreadId
        ? getTeamRuntimeService(workingDir)
        : null
    const titlePlan = await seedInitialChatThreadTitle({
        workingDir,
        sessionId,
        request,
        isAssistant: promptRuntime.isAssistant,
    })

    await beginTeamTurn({
        teamRuntime,
        teamThreadId: request.teamThreadId,
        participantKey: rawAgentId,
    })

    try {
        if (request.teamId) {
            await ensureTeamToolFiles(workingDir, workingDir)
        }

        await retryOnAgentRegistryMiss({
            oc,
            directory: workingDir,
            agentName: promptRuntime.agentName,
            getRunningSessions: async (directory) => (await countRunningSessions(directory)).runningSessions,
            logLabel: 'chat-message-service',
            run: async () => unwrapOpencodeResult(await oc.session.promptAsync({
                sessionID: sessionId,
                directory: workingDir,
                agent: promptRuntime.agentName,
                // Pass model directly so OpenCode uses the user's selected model,
                // not the (potentially stale) model cached from the agent file.
                model: {
                    providerID: promptRuntime.model.provider,
                    modelID: promptRuntime.model.modelId,
                },
                system: joinPromptSections([
                    request.teamId ? teamSystemPrompt : '',
                    promptRuntime.systemPrompt,
                ]),
                tools: promptRuntime.promptTools,
                parts,
            })),
        })
    } catch (error) {
        await syncTeamParticipantSessionFailure(sessionId, error)
        if (teamRuntime && rawAgentId) {
            await teamRuntime.drainParticipantQueue(request.teamThreadId!, rawAgentId).catch(() => {})
        }
        throw error
    }

    scheduleGeneratedChatThreadTitle({
        workingDir,
        sessionId,
        request,
        titlePlan,
    })
    scheduleTeamTurnSettlement({
        oc,
        sessionId,
        workingDir,
        teamRuntime,
        teamThreadId: request.teamThreadId,
        participantKey: rawAgentId,
    })

    return { accepted: true as const }
}
