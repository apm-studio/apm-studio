import {
    TextChannel,
    type Client,
} from 'discord.js'
import type { DiscordChannelTarget } from '../../../shared/discord-contracts.js'
import type { TeamThreadSummary } from '../../../shared/team-types.js'
import { readDiscordMappings } from './config-store.js'
import {
    participantDisplayName,
    sleep,
    TEAM_THREAD_IDLE_CONFIRMATIONS,
    TEAM_THREAD_SYNC_POLL_MS,
    TEAM_THREAD_SYNC_TIMEOUT_MS,
} from './discord-service-helpers.js'
import type { DiscordOutputPresenter } from './discord-output-presenter.js'
import {
    findWorkspaceTeam,
    isDiscordSessionRunning,
    listTeamThreadsForDiscord,
    type DiscordTeamSnapshot,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'

type DiscordTeamThreadTarget = Extract<DiscordChannelTarget, { kind: 'team-thread' }>

interface DiscordTeamThreadSyncDeps {
    outputPresenter: DiscordOutputPresenter
    client: () => Client | null
    loadSnapshotForTarget: (target: DiscordTeamThreadTarget) => Promise<DiscordWorkspaceSnapshot>
    isDiscordSessionTurnActive: (sessionId: string) => boolean
    refreshTeamThreadChannelName: (channel: TextChannel, target: DiscordTeamThreadTarget) => Promise<void>
}

export class DiscordTeamThreadSyncService {
    private readonly deps: DiscordTeamThreadSyncDeps
    private readonly activeSyncs = new Map<string, { promise: Promise<number>; expiresAt: number }>()

    constructor(deps: DiscordTeamThreadSyncDeps) {
        this.deps = deps
    }

    clear() {
        this.activeSyncs.clear()
    }

    async handleRuntimeThreadUpdated(workingDir: string, thread: TeamThreadSummary) {
        const client = this.deps.client()
        if (!client?.isReady()) {
            return
        }
        const mappings = await readDiscordMappings()
        const targets = Object.entries(mappings.channels).filter(([, target]) =>
            target.kind === 'team-thread'
            && target.workingDir === workingDir
            && target.teamId === thread.teamId
            && target.threadId === thread.id,
        ) as Array<[string, DiscordTeamThreadTarget]>

        for (const [channelId, target] of targets) {
            const channel = await client.channels.fetch(channelId).catch(() => null)
            if (!(channel instanceof TextChannel)) {
                continue
            }
            const snapshot = await this.deps.loadSnapshotForTarget(target).catch(() => null)
            const team = snapshot ? findWorkspaceTeam(snapshot, target.teamId) : null
            if (!team) {
                continue
            }
            const running = await this.isThreadRunning(target, thread, { ignoreDiscordTurnLocks: true }).catch(() => false)
            if (running) {
                await channel.sendTyping().catch(() => {})
            }
            void this.syncUntilIdle({
                channel,
                target,
                team,
                thread,
                limitPerParticipant: 20,
            }).catch((error) => {
                console.error('[discord] Team thread sync from runtime event failed:', error)
            })
        }
    }

    async syncParticipantHistory(params: {
        channel: TextChannel
        target: DiscordTeamThreadTarget
        team: DiscordTeamSnapshot
        thread: { participantSessions?: Record<string, string> }
        limitPerParticipant?: number
    }) {
        let total = 0
        const sessionEntries = {
            ...(params.thread.participantSessions || {}),
            ...(params.target.sessionIds || {}),
        }
        for (const [participantKey, sessionId] of Object.entries(sessionEntries)) {
            if (!sessionId) continue
            total += await this.deps.outputPresenter.backfillSessionHistory({
                channel: params.channel,
                workspaceId: params.target.workspaceId,
                workingDir: params.target.workingDir,
                sessionId,
                assistantLabel: participantDisplayName(params.team, participantKey),
                limit: params.limitPerParticipant || 20,
                announce: false,
                includeUserMessages: false,
            })
        }
        return total
    }

    async syncUntilIdle(params: {
        channel: TextChannel
        target: DiscordTeamThreadTarget
        team: DiscordTeamSnapshot
        thread: { participantSessions?: Record<string, string> }
        limitPerParticipant?: number
        ignoreActiveTurnSessionIds?: string[]
    }) {
        const key = this.syncKey(params.channel, params.target)
        const active = this.activeSyncs.get(key)
        if (active) {
            active.expiresAt = Date.now() + TEAM_THREAD_SYNC_TIMEOUT_MS
            return active.promise
        }
        const run = this.runSyncUntilIdle(params)
            .finally(() => {
                if (this.activeSyncs.get(key)?.promise === run) {
                    this.activeSyncs.delete(key)
                }
            })
        this.activeSyncs.set(key, {
            promise: run,
            expiresAt: Date.now() + TEAM_THREAD_SYNC_TIMEOUT_MS,
        })
        return run
    }

    private async runSyncUntilIdle(params: {
        channel: TextChannel
        target: DiscordTeamThreadTarget
        team: DiscordTeamSnapshot
        thread: { participantSessions?: Record<string, string> }
        limitPerParticipant?: number
        ignoreActiveTurnSessionIds?: string[]
    }) {
        const key = this.syncKey(params.channel, params.target)
        let total = 0
        let idleConfirmations = 0
        let thread = params.thread
        while (Date.now() < (this.activeSyncs.get(key)?.expiresAt || 0)) {
            const latestThreads = await listTeamThreadsForDiscord(params.target.workingDir, params.target.teamId).catch(() => ({ threads: [] }))
            thread = latestThreads.threads.find((entry) => entry.id === params.target.threadId) || thread

            const synced = await this.syncParticipantHistory({
                channel: params.channel,
                target: params.target,
                team: params.team,
                thread,
                limitPerParticipant: params.limitPerParticipant || 20,
            })
            total += synced
            await this.deps.refreshTeamThreadChannelName(params.channel, params.target)

            const running = await this.isThreadRunning(params.target, thread, {
                ignoreActiveTurnSessionIds: new Set(params.ignoreActiveTurnSessionIds || []),
                ignoreDiscordTurnLocks: true,
            })
            if (running) {
                idleConfirmations = 0
                await params.channel.sendTyping().catch(() => {})
            } else if (synced > 0) {
                idleConfirmations = 0
                const active = this.activeSyncs.get(key)
                if (active) {
                    active.expiresAt = Date.now() + TEAM_THREAD_SYNC_TIMEOUT_MS
                }
            } else {
                idleConfirmations += 1
                if (idleConfirmations >= TEAM_THREAD_IDLE_CONFIRMATIONS) {
                    break
                }
            }

            await sleep(TEAM_THREAD_SYNC_POLL_MS)
        }

        await sleep(1_000)
        const latestThreads = await listTeamThreadsForDiscord(params.target.workingDir, params.target.teamId).catch(() => ({ threads: [] }))
        thread = latestThreads.threads.find((entry) => entry.id === params.target.threadId) || thread
        total += await this.syncParticipantHistory({
            channel: params.channel,
            target: params.target,
            team: params.team,
            thread,
            limitPerParticipant: params.limitPerParticipant || 20,
        })
        await this.deps.refreshTeamThreadChannelName(params.channel, params.target)
        return total
    }

    private async isThreadRunning(
        target: DiscordTeamThreadTarget,
        thread: {
            participantSessions?: Record<string, string>
            participantStatuses?: Record<string, { type?: string }>
        },
        options: {
            ignoreActiveTurnSessionIds?: Set<string>
            ignoreDiscordTurnLocks?: boolean
        } = {},
    ) {
        for (const status of Object.values(thread.participantStatuses || {})) {
            if (status?.type === 'busy' || status?.type === 'retry') {
                return true
            }
        }
        for (const sessionId of Object.values(thread.participantSessions || {})) {
            if (!sessionId) continue
            if (!options.ignoreDiscordTurnLocks && !options.ignoreActiveTurnSessionIds?.has(sessionId) && this.deps.isDiscordSessionTurnActive(sessionId)) {
                return true
            }
            if (await isDiscordSessionRunning(target.workingDir, sessionId)) {
                return true
            }
        }
        return false
    }

    private syncKey(channel: TextChannel, target: DiscordTeamThreadTarget) {
        return `${channel.id}:${target.workspaceId}:${target.teamId}:${target.threadId}`
    }
}
