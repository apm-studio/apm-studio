import {
    ChannelType,
    Guild,
    TextChannel,
} from 'discord.js'
import type { DiscordMappings } from '../../../shared/discord-contracts.js'
import { isStudioEntityCategoryName } from './sync-plan.js'

type DiscordSyncTimeoutRunner = <T>(
    label: string,
    operation: () => Promise<T>,
    timeoutMs?: number,
) => Promise<T>

type DiscordBestEffortRunner = (
    label: string,
    operation: () => Promise<unknown>,
    timeoutMs?: number,
) => Promise<void>

export class DiscordChannelManager {
    private readonly deps: {
        withDiscordSyncTimeout: DiscordSyncTimeoutRunner
        runDiscordSyncBestEffort: DiscordBestEffortRunner
    }

    constructor(deps: {
        withDiscordSyncTimeout: DiscordSyncTimeoutRunner
        runDiscordSyncBestEffort: DiscordBestEffortRunner
    }) {
        this.deps = deps
    }

    async ensureCategory(guild: Guild, channelId: string | undefined, name: string) {
        const existing = channelId
            ? await this.deps.withDiscordSyncTimeout(`fetch Discord category ${channelId}`, () => guild.channels.fetch(channelId, { force: true }).catch(() => null))
            : null
        if (existing?.type === ChannelType.GuildCategory) {
            if (existing.name !== name) {
                await this.deps.runDiscordSyncBestEffort(`rename Discord category ${existing.id}`, () => existing.setName(name), 3_000)
            }
            return existing
        }
        return this.deps.withDiscordSyncTimeout(`create Discord category ${name}`, () => guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
        }))
    }

    async ensureTextChannel(
        guild: Guild,
        channelId: string | undefined,
        name: string,
        parentId: string,
        topic: string,
    ) {
        const existing = channelId
            ? await this.deps.withDiscordSyncTimeout(`fetch Discord text channel ${channelId}`, () => guild.channels.fetch(channelId, { force: true }).catch(() => null))
            : null
        if (existing?.type === ChannelType.GuildText) {
            let channel = existing as TextChannel
            if (channel.name !== name) {
                await this.deps.runDiscordSyncBestEffort(`rename Discord text channel ${channel.id}`, () => channel.setName(name))
            }
            if (channel.parentId !== parentId) {
                const moved = await this.deps.withDiscordSyncTimeout(
                    `move Discord text channel ${channel.id}`,
                    () => channel.setParent(parentId),
                ).catch((error) => {
                    console.warn(`[discord] move Discord text channel ${channel.id} failed during workspace sync:`, error)
                    return null
                })
                if (moved?.type === ChannelType.GuildText) {
                    channel = moved
                }
            }
            if (channel.topic !== topic) {
                await this.deps.runDiscordSyncBestEffort(`update Discord text channel topic ${channel.id}`, () => channel.setTopic(topic))
            }
            return channel
        }
        return this.deps.withDiscordSyncTimeout(`create Discord text channel ${name}`, () => guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: parentId,
            topic,
        }))
    }

    async moveChannelsToCategory(guild: Guild, channelIds: string[], parentId: string) {
        for (const channelId of Array.from(new Set(channelIds))) {
            const channel = await this.deps.withDiscordSyncTimeout(
                `fetch Discord channel ${channelId}`,
                () => guild.channels.fetch(channelId, { force: true }).catch(() => null),
            ).catch(() => null)
            if (channel?.type === ChannelType.GuildText && channel.parentId !== parentId) {
                await this.deps.runDiscordSyncBestEffort(`move Discord text channel ${channel.id}`, () => channel.setParent(parentId))
            }
        }
    }

    async moveCategoryToBottom(guild: Guild, categoryId: string) {
        const channels = await this.deps.withDiscordSyncTimeout(
            `fetch Discord channels before positioning category ${categoryId}`,
            () => guild.channels.fetch(),
        )
        const categories = Array.from(channels.values())
            .filter((channel) => channel?.type === ChannelType.GuildCategory)
        const category = categories.find((channel) => channel.id === categoryId)
        if (!category || categories.length <= 1) {
            return
        }
        await category.setPosition(categories.length - 1)
    }

    async deleteTextChannels(guild: Guild, channelIds: string[], reason: string) {
        const cleanedChannelIds = new Set<string>()
        for (const channelId of Array.from(new Set(channelIds))) {
            const channel = await this.deps.withDiscordSyncTimeout(
                `fetch stale Discord text channel ${channelId}`,
                () => guild.channels.fetch(channelId, { force: true }).catch(() => null),
            ).catch((error) => {
                console.warn('[discord] Failed to fetch stale thread channel during workspace sync cleanup:', {
                    channelId,
                    error,
                })
                return null
            })
            if (!channel) {
                cleanedChannelIds.add(channelId)
                continue
            }
            if (channel?.type === ChannelType.GuildText) {
                try {
                    await this.deps.withDiscordSyncTimeout(`delete stale Discord text channel ${channel.id}`, () => channel.delete(reason))
                    cleanedChannelIds.add(channelId)
                } catch (error) {
                    console.warn('[discord] Failed to delete stale thread channel during workspace sync cleanup:', {
                        channelId,
                        error,
                    })
                }
            } else {
                cleanedChannelIds.add(channelId)
            }
        }
        return cleanedChannelIds
    }

    workspaceCategoryIdUseCounts(mappings: DiscordMappings) {
        const counts = new Map<string, number>()
        for (const mapping of Object.values(mappings.workspaces)) {
            if (!mapping.categoryId) {
                continue
            }
            counts.set(mapping.categoryId, (counts.get(mapping.categoryId) || 0) + 1)
        }
        return counts
    }

    mappedDiscordEntityCategoryIds(mappings: DiscordMappings) {
        const ids = new Set<string>()
        for (const mapping of Object.values(mappings.workspaces)) {
            for (const categoryId of Object.values(mapping.agentCategories || {})) {
                ids.add(categoryId)
            }
            for (const categoryId of Object.values(mapping.teamCategories || {})) {
                ids.add(categoryId)
            }
        }
        if (mappings.activeCategoryId) {
            ids.add(mappings.activeCategoryId)
        }
        if (mappings.archiveCategoryId) {
            ids.add(mappings.archiveCategoryId)
        }
        return ids
    }

    async fetchCategoryChildCounts(guild: Guild, label: string) {
        const channels = await this.deps.withDiscordSyncTimeout(
            `fetch Discord channels for ${label}`,
            () => guild.channels.fetch(),
        ).catch((error) => {
            console.warn(`[discord] Failed to fetch channels during ${label}:`, error)
            return null
        })
        if (!channels) {
            return null
        }
        const childCounts = new Map<string, number>()
        for (const channel of channels.values()) {
            if (!channel) {
                continue
            }
            const parentId = 'parentId' in channel ? channel.parentId : null
            if (parentId) {
                childCounts.set(parentId, (childCounts.get(parentId) || 0) + 1)
            }
        }
        return childCounts
    }

    async deleteUnmappedEmptyEntityCategories(guild: Guild, mappings: DiscordMappings) {
        const channels = await this.deps.withDiscordSyncTimeout(
            'fetch Discord channels for orphan entity category cleanup',
            () => guild.channels.fetch(),
        ).catch((error) => {
            console.warn('[discord] Failed to fetch channels during orphan category cleanup:', error)
            return null
        })
        if (!channels) {
            return
        }
        const knownCategoryIds = this.mappedDiscordEntityCategoryIds(mappings)
        const childCounts = new Map<string, number>()
        for (const channel of channels.values()) {
            if (!channel) {
                continue
            }
            const parentId = 'parentId' in channel ? channel.parentId : null
            if (parentId) {
                childCounts.set(parentId, (childCounts.get(parentId) || 0) + 1)
            }
        }
        const orphanCategoryIds: string[] = []
        for (const channel of channels.values()) {
            if (!channel || channel.type !== ChannelType.GuildCategory) {
                continue
            }
            if (!isStudioEntityCategoryName(channel.name)) {
                continue
            }
            if (knownCategoryIds.has(channel.id)) {
                continue
            }
            if ((childCounts.get(channel.id) || 0) > 0) {
                continue
            }
            orphanCategoryIds.push(channel.id)
        }
        await this.deleteCategories(
            guild,
            orphanCategoryIds,
            'APM Studio orphan entity category cleanup',
        )
    }

    async deleteInactiveWorkspaceRootCategories(
        guild: Guild,
        mappings: DiscordMappings,
        activeWorkspaceId: string,
        activeCategoryId: string,
        archiveCategoryId: string,
    ) {
        const inactiveCategoryEntries = Object.entries(mappings.workspaces)
            .filter(([workspaceId]) => workspaceId !== activeWorkspaceId)
            .map(([workspaceId, mapping]) => [workspaceId, mapping.categoryId] as const)
            .filter((entry): entry is readonly [string, string] => {
                const categoryId = entry[1]
                return !!categoryId && categoryId !== activeCategoryId && categoryId !== archiveCategoryId
            })
        const childCounts = await this.fetchCategoryChildCounts(guild, 'inactive workspace root category cleanup')
        if (!childCounts) {
            return
        }
        const emptyInactiveCategoryEntries = inactiveCategoryEntries
            .filter(([, categoryId]) => (childCounts.get(categoryId) || 0) === 0)
        const cleanedCategoryIds = await this.deleteCategories(
            guild,
            emptyInactiveCategoryEntries.map(([, categoryId]) => categoryId),
            'APM Studio inactive workspace root category cleanup',
        )
        for (const [workspaceId, categoryId] of emptyInactiveCategoryEntries) {
            if (cleanedCategoryIds.has(categoryId)) {
                delete mappings.workspaces[workspaceId]?.categoryId
            }
        }
    }

    async deleteCategories(
        guild: Guild,
        categoryIds: string[],
        reason = 'APM Studio inactive workspace category cleanup',
    ) {
        const cleanedCategoryIds = new Set<string>()
        for (const categoryId of Array.from(new Set(categoryIds))) {
            const channel = await this.deps.withDiscordSyncTimeout(
                `fetch obsolete Discord category ${categoryId}`,
                () => guild.channels.fetch(categoryId, { force: true }).catch(() => null),
            ).catch(() => null)
            if (!channel) {
                cleanedCategoryIds.add(categoryId)
                continue
            }
            if (channel?.type === ChannelType.GuildCategory) {
                try {
                    await this.deps.withDiscordSyncTimeout(
                        `delete obsolete Discord category ${channel.id}`,
                        () => channel.delete(reason),
                    )
                    cleanedCategoryIds.add(categoryId)
                } catch (error) {
                    console.warn('[discord] Failed to delete obsolete category during workspace sync cleanup:', {
                        categoryId,
                        error,
                    })
                }
            } else {
                cleanedCategoryIds.add(categoryId)
            }
        }
        return cleanedCategoryIds
    }
}
