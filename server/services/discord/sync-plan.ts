const DISCORD_NAME_MAX = 90
const DEFAULT_THREAD_NAME = 'New thread'

function compactWhitespace(value: string) {
    return value.replace(/\s+/g, ' ').trim()
}

function basename(workingDir: string) {
    const normalized = workingDir.trim().replace(/[\\/]+$/, '')
    return normalized.split(/[/\\]/).pop() || 'workspace'
}

export function sanitizeDiscordName(value: string, fallback = 'item') {
    const normalized = compactWhitespace(value)
        .toLowerCase()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9가-힣._ -]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-._]+|[-._]+$/g, '')
    const name = normalized || fallback
    return name.slice(0, DISCORD_NAME_MAX)
}

export function workspaceCategoryName(workingDir: string) {
    return compactWhitespace(basename(workingDir)).slice(0, 70)
}

export function archiveCategoryName() {
    return 'archived'
}

export function controlChannelName() {
    return 'studio-control'
}

export function entityCategoryName(name: string, fallback = 'studio') {
    return compactWhitespace(name || fallback).slice(0, DISCORD_NAME_MAX) || fallback
}

export function agentCategoryName(name: string) {
    return `👤 ${entityCategoryName(name, 'agent')}`.slice(0, DISCORD_NAME_MAX)
}

export function teamCategoryName(name: string) {
    return `👥 ${entityCategoryName(name, 'team')}`.slice(0, DISCORD_NAME_MAX)
}

export function isStudioEntityCategoryName(name: string) {
    return name.startsWith('👤 ') || name.startsWith('👥 ')
}

export function defaultThreadName(index = 1) {
    return `${DEFAULT_THREAD_NAME} (${Math.max(1, index)})`
}

export function unnamedThreadNameFor(
    threads: Array<{ id: string; name?: string | null; createdAt?: number; updatedAt?: number }>,
    threadId: string,
) {
    const unnamed = threads
        .filter((thread) => !thread.name?.trim())
        .sort((left, right) => {
            const createdDelta = (left.createdAt || left.updatedAt || 0) - (right.createdAt || right.updatedAt || 0)
            return createdDelta || left.id.localeCompare(right.id)
        })
    const index = unnamed.findIndex((thread) => thread.id === threadId)
    return defaultThreadName(index >= 0 ? index + 1 : unnamed.length + 1)
}

export function threadChannelName(name: string | undefined, threadId: string) {
    void threadId
    return sanitizeDiscordName(name || defaultThreadName(), 'new-thread')
}

export function agentChannelName(name: string) {
    return sanitizeDiscordName(name, 'agent')
}

export function teamThreadChannelName(teamName: string, threadName?: string) {
    return threadChannelName(threadName, teamName)
}

export function teamThreadMappingKey(teamId: string, threadId: string) {
    return `${teamId}:${threadId}`
}

export function agentThreadMappingKey(agentId: string, sessionId: string) {
    return `${agentId}:${sessionId}`
}

export type DiscordLiveThreadIds = Record<string, Iterable<string> | null | undefined>

export type DiscordThreadCleanupMapping = {
    agentThreadChannels?: Record<string, string>
    teamThreadChannels?: Record<string, string>
    backfilledMessageIds?: Record<string, string[]>
}

export type DiscordThreadCleanupPlan = {
    staleChannelIds: string[]
    removedAgentThreadKeys: string[]
    removedTeamThreadKeys: string[]
}

function liveThreadMap(value: DiscordLiveThreadIds) {
    return new Map(
        Object.entries(value).map(([ownerId, ids]) => [
            ownerId,
            ids ? new Set(Array.from(ids)) : null,
        ] as const),
    )
}

function mappedThreadIsLive(key: string, liveIdsByOwner: Map<string, Set<string> | null>) {
    const separatorIndex = key.indexOf(':')
    if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
        return false
    }
    const ownerId = key.slice(0, separatorIndex)
    const threadId = key.slice(separatorIndex + 1)
    if (!liveIdsByOwner.has(ownerId)) {
        return false
    }
    const liveIds = liveIdsByOwner.get(ownerId) ?? null
    return liveIds === null || liveIds.has(threadId)
}

export function pruneStaleDiscordThreadMappings(args: {
    mapping: DiscordThreadCleanupMapping
    agentThreadIds: DiscordLiveThreadIds
    teamThreadIds: DiscordLiveThreadIds
}): DiscordThreadCleanupPlan {
    const agentLiveIds = liveThreadMap(args.agentThreadIds)
    const teamLiveIds = liveThreadMap(args.teamThreadIds)
    const staleChannelIds = new Set<string>()
    const removedAgentThreadKeys: string[] = []
    const removedTeamThreadKeys: string[] = []

    for (const [key, channelId] of Object.entries(args.mapping.agentThreadChannels || {})) {
        if (mappedThreadIsLive(key, agentLiveIds)) {
            continue
        }
        staleChannelIds.add(channelId)
        removedAgentThreadKeys.push(key)
        delete args.mapping.agentThreadChannels?.[key]
    }

    for (const [key, channelId] of Object.entries(args.mapping.teamThreadChannels || {})) {
        if (mappedThreadIsLive(key, teamLiveIds)) {
            continue
        }
        staleChannelIds.add(channelId)
        removedTeamThreadKeys.push(key)
        delete args.mapping.teamThreadChannels?.[key]
    }

    for (const channelId of staleChannelIds) {
        delete args.mapping.backfilledMessageIds?.[channelId]
    }

    return {
        staleChannelIds: Array.from(staleChannelIds),
        removedAgentThreadKeys,
        removedTeamThreadKeys,
    }
}
