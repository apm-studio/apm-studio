import type { TeamDefinition } from '../../../shared/team-types.js'
import type { WakeUpTarget } from './event-router.js'
import { buildWakePrompt, markMessagesDelivered } from './wake-prompt-builder.js'
import type { Mailbox } from './mailbox.js'
import type { ThreadManager } from './thread-manager.js'
import { formatTeamSessionError } from './team-session-settlement.js'
import { clearTeamSessionWaitUntilParked } from './wait-until-session-park.js'
import { buildTextPromptParts } from '../chat/turn-prompt-service.js'
import { StudioValidationError, unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { retryOnAgentRegistryMiss } from '../../lib/opencode-prompt.js'
import {
    clearParticipantQueueRunning,
    getParticipantSessionQueue,
    markParticipantQueueRunning,
    participantCircuitState,
    tripParticipantCircuit,
} from './wake-participant-state.js'
import { scheduleBlockedWakeRetry } from './wake-blocked-retry.js'
import { resolveWakeParticipantSession } from './wake-session-resolver.js'
import { prepareWakeRuntimeProjection } from './wake-runtime-projection.js'
import { observeWakeSessionSettlement } from './wake-session-settlement.js'
import {
    emptyWakeCascadeResult,
    mergeWakeCascadeResult,
    type WakeCascadeResult,
} from './wake-cascade-result.js'
import { BLOCKED_PROJECTION_RETRY_MESSAGE } from './wake-cascade-constants.js'

export async function injectWakeTarget(params: {
    target: WakeUpTarget
    teamDefinition: TeamDefinition
    mailbox: Mailbox
    threadManager: ThreadManager
    threadId: string
    workingDir: string
    drainAfterSettlement: () => Promise<WakeCascadeResult>
}): Promise<WakeCascadeResult> {
    const {
        target,
        teamDefinition,
        mailbox,
        threadManager,
        threadId,
        workingDir,
        drainAfterSettlement,
    } = params
    const result = emptyWakeCascadeResult()
    result.targets = [target]

    const participantKey = target.participantKey
    const circuit = participantCircuitState(threadId, participantKey)
    if (circuit) {
        console.warn(
            `[wake-cascade] Skipping wake for "${participantKey}" while circuit is open: ${circuit.reason}`,
        )
        return result
    }

    const prompt = buildWakePrompt(target, mailbox, teamDefinition)
    markParticipantQueueRunning(threadId, participantKey)

    try {
        const { getOpencode } = await import('../../lib/opencode.js')
        const oc = await getOpencode()
        const { countRunningSessions } = await import('../runtime/reload-service.js')

        const { resolveAgentForWake } = await import('./wake-agent-resolver.js')
        const agentConfig = await resolveAgentForWake(
            threadManager.workingDir,
            teamDefinition,
            participantKey,
        )

        const sessionResolution = await resolveWakeParticipantSession({
            threadManager,
            teamDefinition,
            threadId,
            participantKey,
            agentName: agentConfig?.agentName,
        })
        if (!sessionResolution.ok) {
            result.errors.push(sessionResolution.error)
            const drainResult = await drainAfterSettlement()
            mergeWakeCascadeResult(result, drainResult)
            return result
        }

        const { sessionId, executionDir } = sessionResolution
        await threadManager.setParticipantStatus(threadId, participantKey, { type: 'busy' })

        const projection = await prepareWakeRuntimeProjection({
            participantKey,
            teamDefinition,
            threadId,
            executionDir,
            threadManager,
            agentConfig,
        })
        if (!projection.ok) {
            clearParticipantQueueRunning(threadId, participantKey)
            await threadManager.setParticipantStatus(threadId, participantKey, {
                type: 'retry',
                message: BLOCKED_PROJECTION_RETRY_MESSAGE,
            })
            getParticipantSessionQueue(threadId).enqueue(participantKey, target)
            result.queued.push(participantKey)
            scheduleBlockedWakeRetry({
                participantKey,
                threadId,
                workingDir,
                drainWhenIdle: () => drainAfterSettlement().then(() => undefined),
            })
            return result
        }

        await retryOnAgentRegistryMiss({
            oc,
            directory: executionDir,
            agentName: projection.agentName,
            getRunningSessions: async (directory) => (await countRunningSessions(directory)).runningSessions,
            logLabel: 'wake-cascade',
            run: async () => unwrapOpencodeResult(await oc.session.promptAsync({
                sessionID: sessionId,
                directory: executionDir,
                agent: projection.agentName,
                model: projection.modelOverride
                    ? { providerID: projection.modelOverride.providerId, modelID: projection.modelOverride.modelId }
                    : undefined,
                system: projection.teamSystemPrompt || undefined,
                tools: projection.projectedTools,
                parts: buildTextPromptParts(prompt),
            })),
        })
        clearTeamSessionWaitUntilParked(sessionId)
        markMessagesDelivered(mailbox, participantKey)

        result.injected.push(participantKey)

        observeWakeSessionSettlement({
            oc,
            sessionId,
            executionDir,
            participantKey,
            threadId,
            threadManager,
            drainAfterSettlement,
            mergeDrainResult: (drainResult) => {
                mergeWakeCascadeResult(result, drainResult)
            },
        })

        return result
    } catch (error: unknown) {
        if (error instanceof StudioValidationError && error.action === 'choose_model') {
            tripParticipantCircuit(threadId, participantKey, formatTeamSessionError(error))
        }
        await threadManager.setParticipantStatus(threadId, participantKey, {
            type: 'error',
            message: formatTeamSessionError(error),
        }).catch(() => {})
        result.errors.push(`Wake injection failed for ${participantKey}: ${formatTeamSessionError(error)}`)
        const drainResult = await drainAfterSettlement()
        mergeWakeCascadeResult(result, drainResult)
        return result
    }
}
