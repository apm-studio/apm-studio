import { nanoid } from 'nanoid'
import type {
    MailboxEvent,
    TeamDefinition,
} from '../../../shared/team-types.js'
import type { Mailbox } from './mailbox.js'
import type { TeamRuntimeActorSystem } from './team-runtime-actors.js'
import type { ThreadManager } from './thread-manager.js'
import {
    processWakeCascade,
} from './wake-cascade.js'
import type { WakeCascadeResult } from './wake-cascade-result.js'

export class WakeCascadeDispatcher {
    private readonly workingDir: string
    private readonly threadManager: ThreadManager
    private readonly actorSystem: TeamRuntimeActorSystem
    private readonly syncParticipantActors: (threadId: string) => void

    constructor(params: {
        workingDir: string
        threadManager: ThreadManager
        actorSystem: TeamRuntimeActorSystem
        syncParticipantActors: (threadId: string) => void
    }) {
        this.workingDir = params.workingDir
        this.threadManager = params.threadManager
        this.actorSystem = params.actorSystem
        this.syncParticipantActors = params.syncParticipantActors
    }

    dispatch(params: {
        threadId: string
        event: MailboxEvent
        teamDefinition: TeamDefinition
        mailbox: Mailbox
        source: string
        emitRuntimeIdle?: boolean
    }) {
        const {
            threadId,
            event,
            teamDefinition,
            mailbox,
            source,
            emitRuntimeIdle = true,
        } = params

        processWakeCascade(event, teamDefinition, mailbox, this.threadManager, threadId, this.workingDir)
            .then((cascadeResult) => {
                this.recordWakeCascadeResult(threadId, cascadeResult)
                this.syncParticipantActors(threadId)
                if (emitRuntimeIdle) {
                    return this.maybeEmitRuntimeIdle(threadId, cascadeResult, teamDefinition, mailbox)
                }
            })
            .catch((error) => console.error(`[team-runtime] Wake cascade error (${source}):`, error))
    }

    private recordWakeCascadeResult(
        threadId: string,
        result: Pick<WakeCascadeResult, 'injected' | 'queued'>,
    ) {
        for (const participantKey of result.injected) {
            this.actorSystem.markParticipantWaking(threadId, participantKey)
        }
        for (const participantKey of result.queued) {
            this.actorSystem.queueParticipant(threadId, participantKey)
        }
    }

    /**
     * Emit a system-level runtime.idle follow-up after a successful cascade.
     * This remains a runtime trigger for subscribed participants, not a normal
     * participant-facing coordination hint in the agent context.
     */
    private async maybeEmitRuntimeIdle(
        threadId: string,
        cascadeResult: WakeCascadeResult,
        teamDefinition: TeamDefinition,
        mailbox: Mailbox,
    ): Promise<void> {
        if (cascadeResult.errors.length > 0) return
        if (cascadeResult.injected.length === 0) return

        const idleEvent: MailboxEvent = {
            id: nanoid(),
            type: 'runtime.idle',
            sourceType: 'system',
            source: 'runtime',
            timestamp: Date.now(),
            payload: {
                threadId,
                injectedCount: cascadeResult.injected.length,
            },
        }
        await this.threadManager.logEvent(threadId, idleEvent)

        const runtime = this.threadManager.getThreadRuntime(threadId)
        if (runtime) {
            this.dispatch({
                threadId,
                event: idleEvent,
                teamDefinition,
                mailbox,
                source: 'runtime.idle',
                emitRuntimeIdle: false,
            })
        }
    }
}
