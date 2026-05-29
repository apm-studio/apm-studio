import type { Guild, TextChannel } from 'discord.js'
import type {
    DiscordIntegrationConfig,
    DiscordSyncResponse,
} from '../../../shared/discord-contracts.js'
import { listSavedWorkspaces, getSavedWorkspace } from '../workspace/service.js'
import {
    getOrCreateWorkspaceMapping,
    readDiscordConfig,
    readDiscordMappings,
    updateDiscordMappings,
} from './config-store.js'
import {
    agentCategoryName,
    archiveCategoryName,
    controlChannelName,
    pruneStaleDiscordThreadMappings,
    teamCategoryName,
    workspaceCategoryName,
} from './sync-plan.js'
import { buildWorkspaceMenuComponents } from './discord-workspace-menu.js'
import {
    workspaceSnapshotFromSaved,
} from './discord-service-helpers.js'
import {
    listStandaloneThreadsForDiscord,
    listTeamThreadsForDiscord,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'
import type { DiscordChannelManager } from './discord-channel-manager.js'

type DiscordBestEffortRunner = (
    label: string,
    operation: () => Promise<unknown>,
    timeoutMs?: number,
) => Promise<void>

export class DiscordWorkspaceSyncService {
    private readonly deps: {
        channelManager: DiscordChannelManager
        ensureReady: () => Promise<void>
        requireGuild: (config: DiscordIntegrationConfig) => Promise<Guild>
        runDiscordSyncBestEffort: DiscordBestEffortRunner
        ensureTeamRuntimeSubscription: (workingDir: string) => void
    }

    constructor(deps: {
        channelManager: DiscordChannelManager
        ensureReady: () => Promise<void>
        requireGuild: (config: DiscordIntegrationConfig) => Promise<Guild>
        runDiscordSyncBestEffort: DiscordBestEffortRunner
        ensureTeamRuntimeSubscription: (workingDir: string) => void
    }) {
        this.deps = deps
    }

    async syncAllWorkspaces(): Promise<DiscordSyncResponse> {
        await this.deps.ensureReady()
        const workspaces = await listSavedWorkspaces()
        const mappings = await readDiscordMappings()
        const savedWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id))
        const targetWorkspaceId = mappings.activeWorkspaceId && savedWorkspaceIds.has(mappings.activeWorkspaceId)
            ? mappings.activeWorkspaceId
            : workspaces[0]?.id
        if (!targetWorkspaceId) {
            return { ok: true, syncedWorkspaces: 0, failedWorkspaces: [] }
        }
        const result = await this.syncWorkspace(targetWorkspaceId)
        return { ...result, syncedWorkspaces: 1, failedWorkspaces: [] }
    }

    async syncWorkspace(workspaceId: string): Promise<DiscordSyncResponse> {
        await this.deps.ensureReady()
        const config = await readDiscordConfig()
        const guild = await this.deps.requireGuild(config)
        const saved = await getSavedWorkspace(workspaceId)
        if (!saved.ok) {
            throw new Error(`${saved.error} (${workspaceId})`)
        }
        const snapshot = workspaceSnapshotFromSaved(saved.workspace)
        this.deps.ensureTeamRuntimeSubscription(snapshot.workingDir)

        let result: Awaited<ReturnType<typeof updateDiscordMappings>>
        try {
            const savedWorkspaces = await listSavedWorkspaces()
            result = await updateDiscordMappings(async (mappings) => {
                const workspaceMapping = getOrCreateWorkspaceMapping(mappings, workspaceId, snapshot.workingDir)
                mappings.version = 2
                const archiveCategory = await this.deps.channelManager.ensureCategory(guild, mappings.archiveCategoryId, archiveCategoryName())
                mappings.archiveCategoryId = archiveCategory.id
                const workspaceCategoryIdUseCounts = this.deps.channelManager.workspaceCategoryIdUseCounts(mappings)
                const reusableWorkspaceCategoryId = workspaceMapping.categoryId
                    && workspaceCategoryIdUseCounts.get(workspaceMapping.categoryId) === 1
                    ? workspaceMapping.categoryId
                    : undefined
                const activeCategory = await this.deps.channelManager.ensureCategory(
                    guild,
                    reusableWorkspaceCategoryId,
                    workspaceCategoryName(snapshot.workingDir),
                )
                void this.deps.runDiscordSyncBestEffort(`position active workspace category ${activeCategory.id}`, () => activeCategory.setPosition(0))
                mappings.activeCategoryId = activeCategory.id
                mappings.activeWorkspaceId = workspaceId
                workspaceMapping.categoryId = activeCategory.id
                workspaceMapping.agentCategories ||= {}
                workspaceMapping.teamCategories ||= {}
                workspaceMapping.agentThreadChannels ||= {}
                workspaceMapping.teamThreadChannels ||= {}
                const menuChannel = await this.deps.channelManager.ensureTextChannel(
                    guild,
                    mappings.menuChannelId || workspaceMapping.menuChannelId,
                    controlChannelName(),
                    activeCategory.id,
                    `APM Studio control for ${snapshot.workingDir}`,
                )
                void this.deps.runDiscordSyncBestEffort(`position Discord workspace menu ${menuChannel.id}`, () => menuChannel.setPosition(0))
                mappings.menuChannelId = menuChannel.id
                workspaceMapping.menuChannelId = menuChannel.id
                mappings.channels[menuChannel.id] = {
                    kind: 'menu',
                    workspaceId,
                    workingDir: snapshot.workingDir,
                }

                const originalAgentThreadChannels = { ...(workspaceMapping.agentThreadChannels || {}) }
                const originalTeamThreadChannels = { ...(workspaceMapping.teamThreadChannels || {}) }
                const originalBackfilledMessageIds = { ...(workspaceMapping.backfilledMessageIds || {}) }
                const [agentThreadEntries, teamThreadEntries] = await Promise.all([
                    Promise.all((snapshot.agents || []).map(async (agent) => {
                        const threads = await listStandaloneThreadsForDiscord(snapshot.workingDir, agent.id)
                            .catch((error) => {
                                console.warn('[discord] Failed to list agent threads during workspace sync cleanup:', {
                                    workspaceId,
                                    agentId: agent.id,
                                    error,
                                })
                                return null
                            })
                        return [agent.id, threads?.map((thread) => thread.id) || null] as const
                    })),
                    Promise.all((snapshot.teams || []).map(async (team) => {
                        const result = await listTeamThreadsForDiscord(snapshot.workingDir, team.id)
                            .catch((error) => {
                                console.warn('[discord] Failed to list Team threads during workspace sync cleanup:', {
                                    workspaceId,
                                    teamId: team.id,
                                    error,
                                })
                                return null
                            })
                        return [team.id, result?.threads.map((thread) => thread.id) || null] as const
                    })),
                ])
                const agentThreadIds = Object.fromEntries(agentThreadEntries)
                const teamThreadIds = Object.fromEntries(teamThreadEntries)
                const agentIds = new Set((snapshot.agents || []).map((agent) => agent.id))
                const teamIds = new Set((snapshot.teams || []).map((team) => team.id))
                const obsoleteAgentCategoryEntries = Object.entries(workspaceMapping.agentCategories)
                    .filter(([agentId]) => !agentIds.has(agentId))
                const obsoleteTeamCategoryEntries = Object.entries(workspaceMapping.teamCategories)
                    .filter(([teamId]) => !teamIds.has(teamId))
                const obsoleteWorkspaceCategoryIds = [
                    ...obsoleteAgentCategoryEntries.map(([, categoryId]) => categoryId),
                    ...obsoleteTeamCategoryEntries.map(([, categoryId]) => categoryId),
                ].filter((categoryId): categoryId is string => !!categoryId)
                const staleChannelIds = new Set(pruneStaleDiscordThreadMappings({
                    mapping: workspaceMapping,
                    agentThreadIds,
                    teamThreadIds,
                }).staleChannelIds)
                for (const [agentId, channelId] of Object.entries(workspaceMapping.agentChannels || {})) {
                    if (agentIds.has(agentId)) {
                        continue
                    }
                    staleChannelIds.add(channelId)
                    delete workspaceMapping.agentChannels?.[agentId]
                }
                for (const [channelId, target] of Object.entries(mappings.channels)) {
                    if (target.workspaceId !== workspaceId) {
                        continue
                    }
                    if (target.kind === 'agent') {
                        const liveThreadIds = agentThreadIds[target.agentId] || []
                        if (!agentIds.has(target.agentId) || (target.sessionId && !liveThreadIds.includes(target.sessionId))) {
                            staleChannelIds.add(channelId)
                        }
                    } else if (target.kind === 'team-thread') {
                        const liveThreadIds = teamThreadIds[target.teamId] || []
                        if (!teamIds.has(target.teamId) || !liveThreadIds.includes(target.threadId)) {
                            staleChannelIds.add(channelId)
                        }
                    }
                }
                const cleanedChannelIds = await this.deps.channelManager.deleteTextChannels(
                    guild,
                    Array.from(staleChannelIds),
                    'APM Studio stale thread cleanup',
                )
                for (const [key, channelId] of Object.entries(originalAgentThreadChannels)) {
                    if (!cleanedChannelIds.has(channelId)) {
                        workspaceMapping.agentThreadChannels[key] = channelId
                    }
                }
                for (const [key, channelId] of Object.entries(originalTeamThreadChannels)) {
                    if (!cleanedChannelIds.has(channelId)) {
                        workspaceMapping.teamThreadChannels[key] = channelId
                    }
                }
                for (const [agentId, channelId] of Object.entries(workspaceMapping.agentChannels || {})) {
                    if (cleanedChannelIds.has(channelId)) {
                        delete workspaceMapping.agentChannels?.[agentId]
                    }
                }
                for (const [key, channelId] of Object.entries(workspaceMapping.agentThreadChannels || {})) {
                    if (cleanedChannelIds.has(channelId)) {
                        delete workspaceMapping.agentThreadChannels?.[key]
                    }
                }
                for (const [key, channelId] of Object.entries(workspaceMapping.teamThreadChannels || {})) {
                    if (cleanedChannelIds.has(channelId)) {
                        delete workspaceMapping.teamThreadChannels?.[key]
                    }
                }
                for (const channelId of cleanedChannelIds) {
                    delete mappings.channels[channelId]
                    delete workspaceMapping.backfilledMessageIds?.[channelId]
                    for (const [pendingId, pending] of Object.entries(mappings.pendingInteractions || {})) {
                        if (pending.channelId === channelId) {
                            delete mappings.pendingInteractions?.[pendingId]
                        }
                    }
                }
                for (const [channelId, messageIds] of Object.entries(originalBackfilledMessageIds)) {
                    if (!cleanedChannelIds.has(channelId) && !workspaceMapping.backfilledMessageIds?.[channelId]) {
                        workspaceMapping.backfilledMessageIds ||= {}
                        workspaceMapping.backfilledMessageIds[channelId] = messageIds
                    }
                }
                const cleanedWorkspaceCategoryIds = await this.deps.channelManager.deleteCategories(guild, obsoleteWorkspaceCategoryIds)
                for (const [agentId, categoryId] of obsoleteAgentCategoryEntries) {
                    if (cleanedWorkspaceCategoryIds.has(categoryId)) {
                        delete workspaceMapping.agentCategories?.[agentId]
                    }
                }
                for (const [teamId, categoryId] of obsoleteTeamCategoryEntries) {
                    if (cleanedWorkspaceCategoryIds.has(categoryId)) {
                        delete workspaceMapping.teamCategories?.[teamId]
                    }
                }

                for (const [mappedWorkspaceId, mappedWorkspace] of Object.entries(mappings.workspaces)) {
                    if (mappedWorkspaceId === workspaceId) continue
                    const channelIds = [
                        mappedWorkspace.menuChannelId === menuChannel.id ? undefined : mappedWorkspace.menuChannelId,
                        ...Object.values(mappedWorkspace.agentChannels || {}),
                        ...Object.values(mappedWorkspace.agentThreadChannels || {}),
                        ...Object.values(mappedWorkspace.teamThreadChannels || {}),
                    ].filter((channelId): channelId is string => !!channelId)
                    await this.deps.channelManager.moveChannelsToCategory(guild, channelIds, archiveCategory.id)
                    const agentCategoryEntries = Object.entries(mappedWorkspace.agentCategories || {})
                    const teamCategoryEntries = Object.entries(mappedWorkspace.teamCategories || {})
                    const cleanedCategoryIds = await this.deps.channelManager.deleteCategories(guild, [
                        ...agentCategoryEntries.map(([, categoryId]) => categoryId),
                        ...teamCategoryEntries.map(([, categoryId]) => categoryId),
                    ])
                    for (const [agentId, categoryId] of agentCategoryEntries) {
                        if (cleanedCategoryIds.has(categoryId)) {
                            delete mappedWorkspace.agentCategories?.[agentId]
                        }
                    }
                    for (const [teamId, categoryId] of teamCategoryEntries) {
                        if (cleanedCategoryIds.has(categoryId)) {
                            delete mappedWorkspace.teamCategories?.[teamId]
                        }
                    }
                }
                await this.deps.channelManager.deleteUnmappedEmptyEntityCategories(guild, mappings)

                let categoryPosition = 1
                for (const agent of snapshot.agents || []) {
                    const category = await this.deps.channelManager.ensureCategory(
                        guild,
                        workspaceMapping.agentCategories[agent.id],
                        agentCategoryName(agent.name),
                    )
                    workspaceMapping.agentCategories[agent.id] = category.id
                    void this.deps.runDiscordSyncBestEffort(`position agent category ${category.id}`, () => category.setPosition(categoryPosition))
                    categoryPosition += 1
                    const threadChannelIds = Object.entries(workspaceMapping.agentThreadChannels || {})
                        .filter(([key]) => key.startsWith(`${agent.id}:`))
                        .map(([, channelId]) => channelId)
                    await this.deps.channelManager.moveChannelsToCategory(guild, [
                        workspaceMapping.agentChannels?.[agent.id],
                        ...threadChannelIds,
                    ].filter((channelId): channelId is string => !!channelId), category.id)
                }

                for (const team of snapshot.teams || []) {
                    const category = await this.deps.channelManager.ensureCategory(
                        guild,
                        workspaceMapping.teamCategories[team.id],
                        teamCategoryName(team.name),
                    )
                    workspaceMapping.teamCategories[team.id] = category.id
                    void this.deps.runDiscordSyncBestEffort(`position Team category ${category.id}`, () => category.setPosition(categoryPosition))
                    categoryPosition += 1
                    const threadChannelIds = Object.entries(workspaceMapping.teamThreadChannels || {})
                        .filter(([key]) => key.startsWith(`${team.id}:`))
                        .map(([, channelId]) => channelId)
                    await this.deps.channelManager.moveChannelsToCategory(guild, threadChannelIds, category.id)
                }
                await this.deps.runDiscordSyncBestEffort(
                    `position archive category ${archiveCategory.id} at bottom`,
                    () => this.deps.channelManager.moveCategoryToBottom(guild, archiveCategory.id),
                    3_000,
                )
                await this.deps.channelManager.deleteInactiveWorkspaceRootCategories(
                    guild,
                    mappings,
                    workspaceId,
                    activeCategory.id,
                    archiveCategory.id,
                )

                await this.deps.runDiscordSyncBestEffort(
                    `post Discord workspace menu ${menuChannel.id}`,
                    () => this.postWorkspaceMenu(menuChannel, workspaceId, snapshot, savedWorkspaces),
                )
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to sync workspace ${snapshot.workingDir}: ${message}`)
        }

        const workspaceMapping = result.workspaces[workspaceId]
        return {
            ok: true,
            workspaceId,
            categoryId: result.activeCategoryId || workspaceMapping?.categoryId,
            menuChannelId: result.menuChannelId || workspaceMapping?.menuChannelId,
        }
    }

    private async postWorkspaceMenu(
        channel: TextChannel,
        workspaceId: string,
        snapshot: DiscordWorkspaceSnapshot,
        savedWorkspaces: Array<{ id: string; workingDir: string }>,
    ) {
        const agentCount = snapshot.agents?.length || 0
        const teamCount = snapshot.teams?.length || 0
        await channel.send({
            content: [
                `**APM Studio**`,
                `Workspace: \`${snapshot.workingDir}\``,
                `Agents: ${agentCount} | Teams: ${teamCount}`,
            ].join('\n'),
            components: buildWorkspaceMenuComponents(workspaceId, snapshot, savedWorkspaces),
            allowedMentions: { parse: [] },
        })
    }
}
