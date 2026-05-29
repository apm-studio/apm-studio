export interface DiscordIntegrationConfig {
    enabled: boolean
    token?: string
    guildId?: string
    requireManageGuild?: boolean
    allowedRoleIds?: string[]
    allowedUserIds?: string[]
}

export interface RedactedDiscordIntegrationConfig {
    enabled: boolean
    hasToken: boolean
    guildId?: string
    requireManageGuild: boolean
    allowedRoleIds: string[]
    allowedUserIds: string[]
}

export interface DiscordConfigUpdateRequest {
    enabled?: boolean
    token?: string
    guildId?: string
    clearToken?: boolean
    requireManageGuild?: boolean
    allowedRoleIds?: string[]
    allowedUserIds?: string[]
}

export type DiscordConnectionState = 'offline' | 'starting' | 'online' | 'reconnecting'

export interface DiscordIntegrationStatus {
    config: RedactedDiscordIntegrationConfig
    online: boolean
    connectionState: DiscordConnectionState
    botUser?: { id: string; username: string }
    applicationId?: string
    inviteUrl?: string
    guilds: Array<{ id: string; name: string }>
    selectedGuild?: { id: string; name: string }
    missingPermissions: string[]
    messageContentLikelyMissing: boolean
    access: {
        requireManageGuild: boolean
        allowedRoleCount: number
        allowedUserCount: number
    }
    lastError?: string
    lastReadyAt?: number
    lastDisconnectAt?: number
}

export interface DiscordSyncRequest {
    workspaceId?: string
}

export interface DiscordSyncFailure {
    workspaceId: string
    workingDir: string
    error: string
}

export interface DiscordSyncResponse {
    ok: true
    workspaceId?: string
    syncedWorkspaces?: number
    failedWorkspaces?: DiscordSyncFailure[]
    categoryId?: string
    menuChannelId?: string
}

export type DiscordChannelTarget =
    | {
        kind: 'agent'
        workspaceId: string
        workingDir: string
        agentId: string
        sessionId?: string
    }
    | {
        kind: 'team-thread'
        workspaceId: string
        workingDir: string
        teamId: string
        threadId: string
        sessionIds?: Record<string, string>
    }
    | {
        kind: 'menu'
        workspaceId: string
        workingDir: string
    }

export interface DiscordWorkspaceMapping {
    workingDir: string
    categoryId?: string
    menuChannelId?: string
    agentCategories?: Record<string, string>
    teamCategories?: Record<string, string>
    agentChannels: Record<string, string>
    agentThreadChannels?: Record<string, string>
    teamThreadChannels: Record<string, string>
    backfilledMessageIds?: Record<string, string[]>
}

export interface DiscordPendingInteraction {
    kind: 'permission' | 'question'
    workspaceId: string
    channelId: string
    workingDir: string
    sessionId: string
    request: Record<string, unknown>
    createdAt?: number
}

export interface DiscordMappings {
    version: 2
    activeWorkspaceId?: string
    activeCategoryId?: string
    archiveCategoryId?: string
    menuChannelId?: string
    workspaces: Record<string, DiscordWorkspaceMapping>
    channels: Record<string, DiscordChannelTarget>
    pendingInteractions?: Record<string, DiscordPendingInteraction>
}
