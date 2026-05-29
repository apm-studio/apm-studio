import type { Guild, TextChannel } from 'discord.js'
import type { DiscordChannelTarget, DiscordIntegrationConfig } from '../../../shared/discord-contracts.js'
import { getOrCreateWorkspaceMapping, readDiscordConfig, readDiscordMappings, updateDiscordMappings } from './config-store.js'
import type { DiscordChannelManager } from './discord-channel-manager.js'
import type { DiscordOutputPresenter } from './discord-output-presenter.js'
import {
    agentCategoryName,
    agentThreadMappingKey,
    teamCategoryName,
    teamThreadMappingKey,
    threadChannelName,
    unnamedThreadNameFor,
} from './sync-plan.js'
import {
    findWorkspaceAgent,
    listStandaloneThreadsForDiscord,
    listTeamThreadsForDiscord,
    type DiscordTeamSnapshot,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'
import { participantDisplayName } from './discord-service-helpers.js'

type DiscordTeamThreadTarget = Extract<DiscordChannelTarget, { kind: 'team-thread' }>

type DiscordTeamThreadSyncRunner = (params: {
    channel: TextChannel
    target: DiscordTeamThreadTarget
    team: DiscordTeamSnapshot
    thread: { participantSessions?: Record<string, string> }
    limitPerParticipant?: number
}) => Promise<number>

export class DiscordThreadChannelManager {
    private readonly deps: {
        channelManager: DiscordChannelManager
        outputPresenter: DiscordOutputPresenter
        requireGuild: (config: DiscordIntegrationConfig) => Promise<Guild>
        syncTeamThreadUntilIdle: DiscordTeamThreadSyncRunner
    }

    constructor(deps: {
        channelManager: DiscordChannelManager
        outputPresenter: DiscordOutputPresenter
        requireGuild: (config: DiscordIntegrationConfig) => Promise<Guild>
        syncTeamThreadUntilIdle: DiscordTeamThreadSyncRunner
    }) {
        this.deps = deps
    }

    async ensureAgentThreadChannel(workspaceId: string, snapshot: DiscordWorkspaceSnapshot, agentId: string, sessionId: string) {
        const config = await readDiscordConfig()
        const guild = await this.deps.requireGuild(config)
        const agent = findWorkspaceAgent(snapshot, agentId)
        if (!agent) {
            throw new Error('Agent not found in the saved workspace.')
        }
        const mappings = await readDiscordMappings()
        const workspaceMapping = getOrCreateWorkspaceMapping(mappings, workspaceId, snapshot.workingDir)
        workspaceMapping.agentCategories ||= {}
        workspaceMapping.agentThreadChannels ||= {}
        const category = await this.deps.channelManager.ensureCategory(
            guild,
            workspaceMapping.agentCategories[agentId],
            agentCategoryName(agent.name),
        )
        const categoryId = category.id
        workspaceMapping.agentCategories[agentId] = categoryId
        mappings.activeWorkspaceId = workspaceId
        const threads = await listStandaloneThreadsForDiscord(snapshot.workingDir, agentId)
        const thread = threads.find((entry) => entry.id === sessionId)
        const mappingKey = agentThreadMappingKey(agentId, sessionId)
        const channel = await this.deps.channelManager.ensureTextChannel(
            guild,
            workspaceMapping.agentThreadChannels[mappingKey],
            threadChannelName(thread?.name, sessionId),
            categoryId,
            `APM Studio agent thread: ${agent.name}`,
        )
        workspaceMapping.agentThreadChannels[mappingKey] = channel.id
        mappings.channels[channel.id] = {
            kind: 'agent',
            workspaceId,
            workingDir: snapshot.workingDir,
            agentId,
            sessionId,
        }
        await updateDiscordMappings(() => mappings)
        await this.deps.outputPresenter.backfillSessionHistory({
            channel,
            workspaceId,
            workingDir: snapshot.workingDir,
            sessionId,
            assistantLabel: agent.name,
        })
        return channel
    }

    async ensureTeamThreadChannel(workspaceId: string, snapshot: DiscordWorkspaceSnapshot, team: DiscordTeamSnapshot, threadId: string) {
        const config = await readDiscordConfig()
        const guild = await this.deps.requireGuild(config)
        const mappings = await readDiscordMappings()
        const workspaceMapping = getOrCreateWorkspaceMapping(mappings, workspaceId, snapshot.workingDir)
        workspaceMapping.teamCategories ||= {}
        workspaceMapping.teamThreadChannels ||= {}
        const category = await this.deps.channelManager.ensureCategory(
            guild,
            workspaceMapping.teamCategories[team.id],
            teamCategoryName(team.name),
        )
        const categoryId = category.id
        workspaceMapping.teamCategories[team.id] = categoryId
        mappings.activeWorkspaceId = workspaceId
        const threads = await listTeamThreadsForDiscord(snapshot.workingDir, team.id)
        const thread = threads.threads.find((entry) => entry.id === threadId)
        const threadName = thread?.name?.trim() || unnamedThreadNameFor(threads.threads, threadId)
        const mappingKey = teamThreadMappingKey(team.id, threadId)
        const channel = await this.deps.channelManager.ensureTextChannel(
            guild,
            workspaceMapping.teamThreadChannels[mappingKey],
            threadChannelName(threadName, threadId),
            categoryId,
            `APM Studio Team thread: ${team.name}`,
        )
        workspaceMapping.teamThreadChannels[mappingKey] = channel.id
        const existingTarget = mappings.channels[channel.id]
        const target: DiscordTeamThreadTarget = {
            kind: 'team-thread',
            workspaceId,
            workingDir: snapshot.workingDir,
            teamId: team.id,
            threadId,
            sessionIds: existingTarget?.kind === 'team-thread'
                ? existingTarget.sessionIds
                : {},
        }
        mappings.channels[channel.id] = target
        await updateDiscordMappings(() => mappings)
        if (thread?.participantSessions) {
            let remaining = 20
            for (const [participantKey, sessionId] of Object.entries(thread.participantSessions)) {
                if (!sessionId || remaining <= 0) continue
                const count = await this.deps.outputPresenter.backfillSessionHistory({
                    channel,
                    workspaceId,
                    workingDir: snapshot.workingDir,
                    sessionId,
                    assistantLabel: participantDisplayName(team, participantKey),
                    limit: remaining,
                    includeUserMessages: false,
                })
                remaining -= count
            }
            void this.deps.syncTeamThreadUntilIdle({
                channel,
                target,
                team,
                thread,
                limitPerParticipant: 20,
            }).catch((error) => {
                console.error('[discord] Team thread sync after channel open failed:', error)
            })
        }
        return channel
    }

    async refreshAgentThreadChannelName(
        channel: TextChannel,
        target: Extract<DiscordChannelTarget, { kind: 'agent' }>,
        sessionId: string,
    ) {
        const threads = await listStandaloneThreadsForDiscord(target.workingDir, target.agentId).catch(() => [])
        const thread = threads.find((entry) => entry.id === sessionId)
        const nextName = threadChannelName(thread?.name, sessionId)
        if (nextName && channel.name !== nextName) {
            await channel.setName(nextName).catch(() => {})
        }
    }

    async refreshTeamThreadChannelName(
        channel: TextChannel,
        target: DiscordTeamThreadTarget,
    ) {
        const threads = await listTeamThreadsForDiscord(target.workingDir, target.teamId).catch(() => ({ threads: [] }))
        const thread = threads.threads.find((entry) => entry.id === target.threadId)
        const threadName = thread?.name?.trim() || unnamedThreadNameFor(threads.threads, target.threadId)
        const nextName = threadChannelName(threadName, target.threadId)
        if (nextName && channel.name !== nextName) {
            await channel.setName(nextName).catch(() => {})
        }
    }

    scheduleThreadChannelNameRefresh(
        channel: TextChannel,
        target: Extract<DiscordChannelTarget, { kind: 'agent' | 'team-thread' }>,
        sessionId?: string,
    ) {
        setTimeout(() => {
            if (target.kind === 'agent' && sessionId) {
                void this.refreshAgentThreadChannelName(channel, target, sessionId)
                return
            }
            if (target.kind === 'team-thread') {
                void this.refreshTeamThreadChannelName(channel, target)
            }
        }, 12_000).unref?.()
    }
}
