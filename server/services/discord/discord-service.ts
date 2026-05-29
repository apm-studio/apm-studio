import {
    Client,
    GatewayIntentBits,
    Guild,
    TextChannel,
} from 'discord.js'
import type {
    DiscordChannelTarget,
    DiscordConfigUpdateRequest,
    DiscordIntegrationConfig,
    DiscordIntegrationStatus,
    DiscordSyncResponse,
} from '../../../shared/discord-contracts.js'
import { getSavedWorkspace } from '../workspace/service.js'
import {
    readDiscordConfig,
    readDiscordMappings,
    redactDiscordConfig,
    writeDiscordConfig,
} from './config-store.js'
import type { DiscordWorkspaceSnapshot } from './studio-runtime.js'
import {
    summarizeDiscordAccess,
} from './access-control.js'
import {
    discordInviteUrl,
    DISCORD_SYNC_BEST_EFFORT_TIMEOUT_MS,
    DISCORD_SYNC_OPERATION_TIMEOUT_MS,
    REQUIRED_PERMISSIONS,
    timeoutError,
    workspaceSnapshotFromSaved,
} from './discord-service-helpers.js'
import { buildDiscordApplicationCommands } from './discord-commands.js'
import { DiscordChannelManager } from './discord-channel-manager.js'
import { DiscordAccessGate } from './discord-access-gate.js'
import { DiscordPendingInteractionStore } from './discord-pending-interactions.js'
import { DiscordOutputPresenter } from './discord-output-presenter.js'
import { DiscordThreadChannelManager } from './discord-thread-channel-manager.js'
import { DiscordWorkspaceSyncService } from './discord-workspace-sync-service.js'
import { DiscordPromptInteractionHandler } from './discord-prompt-interactions.js'
import { DiscordTeamThreadSyncService } from './discord-team-thread-sync-service.js'
import { DiscordSessionTurnTracker } from './discord-session-turn-tracker.js'
import { DiscordMessageService } from './discord-message-service.js'
import { DiscordInteractionService } from './discord-interaction-service.js'
import {
    attachDiscordClientEventHandlers,
    waitForDiscordClientReady,
} from './discord-client-events.js'
import { DiscordTeamRuntimeSubscriptions } from './discord-team-runtime-subscriptions.js'

class DiscordIntegrationService {
    private client: Client | null = null
    private startPromise: Promise<void> | null = null
    private lastError: string | undefined
    private connectionState: DiscordIntegrationStatus['connectionState'] = 'offline'
    private lastReadyAt: number | undefined
    private lastDisconnectAt: number | undefined
    private messageContentLikelyMissing = false
    private readonly accessGate = new DiscordAccessGate()
    private readonly pendingInteractions = new DiscordPendingInteractionStore()
    private readonly sessionTurns = new DiscordSessionTurnTracker()
    private readonly outputPresenter = new DiscordOutputPresenter({
        pendingInteractions: this.pendingInteractions,
        noteDiscordIssue: (message, error) => this.noteDiscordIssue(message, error),
    })
    private readonly channelManager = new DiscordChannelManager({
        withDiscordSyncTimeout: (label, operation, timeoutMs) => this.withDiscordSyncTimeout(label, operation, timeoutMs),
        runDiscordSyncBestEffort: (label, operation, timeoutMs) => this.runDiscordSyncBestEffort(label, operation, timeoutMs),
    })
    private readonly teamThreadSync: DiscordTeamThreadSyncService = new DiscordTeamThreadSyncService({
        outputPresenter: this.outputPresenter,
        client: () => this.client,
        loadSnapshotForTarget: (target) => this.loadSnapshotForTarget(target),
        isDiscordSessionTurnActive: (sessionId) => this.sessionTurns.isActive(sessionId),
        refreshTeamThreadChannelName: (channel, target): Promise<void> =>
            this.threadChannels.refreshTeamThreadChannelName(channel, target),
    })
    private readonly teamRuntimeSubscriptions = new DiscordTeamRuntimeSubscriptions({
        handleRuntimeThreadUpdated: (workingDir, thread) =>
            this.teamThreadSync.handleRuntimeThreadUpdated(workingDir, thread),
    })
    private readonly threadChannels: DiscordThreadChannelManager = new DiscordThreadChannelManager({
        channelManager: this.channelManager,
        outputPresenter: this.outputPresenter,
        requireGuild: (config) => this.requireGuild(config),
        syncTeamThreadUntilIdle: (params): Promise<number> => this.teamThreadSync.syncUntilIdle(params),
    })
    private readonly workspaceSync = new DiscordWorkspaceSyncService({
        channelManager: this.channelManager,
        ensureReady: async () => {
            await this.ensureReady()
        },
        requireGuild: (config) => this.requireGuild(config),
        runDiscordSyncBestEffort: (label, operation, timeoutMs) => this.runDiscordSyncBestEffort(label, operation, timeoutMs),
        ensureTeamRuntimeSubscription: (workingDir) => this.teamRuntimeSubscriptions.ensure(workingDir),
    })
    private readonly promptInteractions = new DiscordPromptInteractionHandler({
        pendingInteractions: this.pendingInteractions,
        outputPresenter: this.outputPresenter,
        loadSnapshotForTarget: (target) => this.loadSnapshotForTarget(target),
        startTypingIndicator: (channel) => this.startTypingIndicator(channel),
        syncTeamThreadUntilIdle: (params) => this.teamThreadSync.syncUntilIdle(params),
    })
    private readonly messageService: DiscordMessageService = new DiscordMessageService({
        authorizeMessage: (message) => this.accessGate.authorizeMessage(message),
        markMessageContentLikelyMissing: () => {
            this.messageContentLikelyMissing = true
        },
        loadSnapshotForTarget: (target) => this.loadSnapshotForTarget(target),
        outputPresenter: this.outputPresenter,
        promptInteractions: this.promptInteractions,
        sessionTurns: this.sessionTurns,
        teamThreadSync: this.teamThreadSync,
        threadChannels: this.threadChannels,
    })
    private readonly interactions: DiscordInteractionService = new DiscordInteractionService({
        accessGate: this.accessGate,
        promptInteractions: this.promptInteractions,
        loadSnapshotForTarget: (target) => this.loadSnapshotForTarget(target),
        syncAllWorkspaces: () => this.syncAllWorkspaces(),
        syncWorkspace: (workspaceId) => this.syncWorkspace(workspaceId),
        ensureAgentThreadChannel: (workspaceId, snapshot, agentId, sessionId) =>
            this.threadChannels.ensureAgentThreadChannel(workspaceId, snapshot, agentId, sessionId),
        ensureTeamThreadChannel: (workspaceId, snapshot, team, threadId) =>
            this.threadChannels.ensureTeamThreadChannel(workspaceId, snapshot, team, threadId),
        refreshTeamThreadChannelName: (channel, target) =>
            this.threadChannels.refreshTeamThreadChannelName(channel, target),
        sendTeamParticipantInput: (params) => this.messageService.sendTeamParticipantInput(params),
        syncTeamThreadParticipantHistory: (params) => this.teamThreadSync.syncParticipantHistory(params),
    })

    async initialize() {
        const config = await readDiscordConfig()
        if (config.enabled && config.token) {
            await this.start().catch((error) => {
                this.lastError = error instanceof Error ? error.message : String(error)
                console.warn('[discord] Failed to start Discord integration:', this.lastError)
            })
        }
    }

    async getStatus(): Promise<DiscordIntegrationStatus> {
        const config = await readDiscordConfig()
        const guilds = this.client?.guilds.cache.map((guild) => ({ id: guild.id, name: guild.name })) || []
        const selectedGuild = config.guildId
            ? this.client?.guilds.cache.get(config.guildId)
            : null
        const applicationId = this.client?.application?.id || this.client?.user?.id

        return {
            config: redactDiscordConfig(config),
            online: !!this.client?.isReady(),
            connectionState: this.resolveConnectionState(),
            ...(this.client?.user ? { botUser: { id: this.client.user.id, username: this.client.user.username } } : {}),
            ...(applicationId ? { applicationId, inviteUrl: discordInviteUrl(applicationId) } : {}),
            guilds,
            ...(selectedGuild ? { selectedGuild: { id: selectedGuild.id, name: selectedGuild.name } } : {}),
            missingPermissions: selectedGuild ? this.missingPermissions(selectedGuild) : [],
            messageContentLikelyMissing: this.messageContentLikelyMissing,
            access: summarizeDiscordAccess(config),
            ...(this.lastError ? { lastError: this.lastError } : {}),
            ...(this.lastReadyAt ? { lastReadyAt: this.lastReadyAt } : {}),
            ...(this.lastDisconnectAt ? { lastDisconnectAt: this.lastDisconnectAt } : {}),
        }
    }

    async updateConfig(patch: DiscordConfigUpdateRequest) {
        const config = await writeDiscordConfig(patch)
        await this.restartForConfig(config)
        return this.getStatus()
    }

    async disconnect() {
        const config = await writeDiscordConfig({ enabled: false, clearToken: true, guildId: '' })
        await this.stop()
        return {
            config: redactDiscordConfig(config),
            online: false,
            connectionState: 'offline',
            guilds: [],
            missingPermissions: [],
            messageContentLikelyMissing: false,
            access: summarizeDiscordAccess(config),
        } satisfies DiscordIntegrationStatus
    }

    async syncAllWorkspaces(): Promise<DiscordSyncResponse> {
        return this.workspaceSync.syncAllWorkspaces()
    }

    async syncWorkspace(workspaceId: string): Promise<DiscordSyncResponse> {
        return this.workspaceSync.syncWorkspace(workspaceId)
    }

    private async restartForConfig(config: DiscordIntegrationConfig) {
        if (!config.enabled || !config.token) {
            await this.stop()
            return
        }
        await this.start(true)
    }

    private resolveConnectionState(): DiscordIntegrationStatus['connectionState'] {
        if (this.client?.isReady()) {
            return 'online'
        }
        if (this.startPromise) {
            return 'starting'
        }
        return this.connectionState
    }

    private noteDiscordIssue(message: string, error?: unknown) {
        const detail = error instanceof Error ? `${message}: ${error.message}` : error ? `${message}: ${String(error)}` : message
        this.lastError = detail
        console.warn('[discord]', detail)
    }

    private async start(force = false) {
        if (!force && this.client?.isReady()) {
            return
        }
        if (this.startPromise && !force) {
            return this.startPromise
        }
        if (force) {
            await this.stop()
        } else if (this.client) {
            this.client.destroy()
            this.client = null
        }
        const config = await readDiscordConfig()
        if (!config.enabled || !config.token) {
            this.connectionState = 'offline'
            return
        }

        this.startPromise = (async () => {
            const client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                ],
            })
            this.client = client
            this.connectionState = 'starting'
            this.lastError = undefined

            attachDiscordClientEventHandlers(client, {
                handleInteraction: (interaction) => this.interactions.handleInteraction(interaction),
                handleMessage: (message) => this.messageService.handleMessage(message),
                noteDiscordIssue: (message, error) => this.noteDiscordIssue(message, error),
                onClientReady: () => {
                    this.connectionState = 'online'
                    this.lastReadyAt = Date.now()
                },
                onDisconnected: () => {
                    this.connectionState = 'reconnecting'
                    this.lastDisconnectAt = Date.now()
                },
                onInteractionError: async (interaction, error) => {
                    console.error('[discord] Interaction failed:', error)
                    this.lastError = error instanceof Error ? error.message : String(error)
                    await this.interactions.replyFailure(interaction, error)
                },
                onMessageError: async (message, error) => {
                    console.error('[discord] Message handling failed:', error)
                    if (message.channel?.isTextBased()) {
                        await message.reply({
                            content: `Studio could not handle that message: ${error instanceof Error ? error.message : String(error)}`,
                            allowedMentions: { parse: [] },
                        }).catch(() => {})
                    }
                },
                onReconnecting: () => {
                    this.connectionState = 'reconnecting'
                },
                onShardReady: () => {
                    this.connectionState = 'online'
                    this.lastReadyAt = Date.now()
                },
            })

            const ready = waitForDiscordClientReady(client)

            await client.login(config.token)
            if (!client.isReady()) {
                await ready
            }
            this.connectionState = 'online'
            this.lastReadyAt = Date.now()
            await this.registerCommands()
            await this.teamRuntimeSubscriptions.subscribeMappedWorkspaces()
        })()

        try {
            await this.startPromise
        } catch (error) {
            this.connectionState = 'offline'
            if (this.client && !this.client.isReady()) {
                this.client.destroy()
                this.client = null
            }
            throw error
        } finally {
            this.startPromise = null
        }
    }

    private async stop() {
        this.teamRuntimeSubscriptions.clear()
        this.teamThreadSync.clear()
        this.sessionTurns.clear()
        if (this.client) {
            this.client.destroy()
            this.client = null
        }
        this.startPromise = null
        this.connectionState = 'offline'
        this.lastDisconnectAt = Date.now()
        this.lastError = undefined
        this.messageContentLikelyMissing = false
    }

    private async ensureReady() {
        await this.start()
        if (!this.client?.isReady()) {
            throw new Error('Discord bot is not online. Check the saved token and enable the integration.')
        }
        return this.client
    }

    private async requireGuild(config: DiscordIntegrationConfig) {
        const client = await this.ensureReady()
        if (!config.guildId) {
            throw new Error('Select a Discord server before syncing.')
        }
        const guild = client.guilds.cache.get(config.guildId) || await client.guilds.fetch(config.guildId).catch(() => null)
        if (!guild) {
            throw new Error('The bot cannot see the selected Discord server.')
        }
        const missing = this.missingPermissions(guild)
        if (missing.length > 0) {
            throw new Error(`Missing Discord permissions: ${missing.join(', ')}`)
        }
        return guild
    }

    private missingPermissions(guild: Guild) {
        const permissions = guild.members.me?.permissions
        if (!permissions) {
            return ['Bot membership not loaded']
        }
        return REQUIRED_PERMISSIONS
            .filter(([, permission]) => !permissions.has(permission))
            .map(([label]) => label)
    }

    private async registerCommands() {
        const client = this.client
        if (!client?.isReady()) {
            return
        }
        const config = await readDiscordConfig()
        const commands = buildDiscordApplicationCommands()

        if (config.guildId) {
            await client.application?.commands.set(commands, config.guildId)
        } else {
            await client.application?.commands.set(commands)
        }
    }

    private async withDiscordSyncTimeout<T>(
        label: string,
        operation: () => Promise<T>,
        timeoutMs = DISCORD_SYNC_OPERATION_TIMEOUT_MS,
    ) {
        let timeout: ReturnType<typeof setTimeout> | null = null
        try {
            return await Promise.race([
                operation(),
                new Promise<T>((_, reject) => {
                    timeout = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs)
                }),
            ])
        } finally {
            if (timeout) {
                clearTimeout(timeout)
            }
        }
    }

    private async runDiscordSyncBestEffort(
        label: string,
        operation: () => Promise<unknown>,
        timeoutMs = DISCORD_SYNC_BEST_EFFORT_TIMEOUT_MS,
    ) {
        try {
            await this.withDiscordSyncTimeout(label, operation, timeoutMs)
        } catch (error) {
            console.warn(`[discord] ${label} failed during workspace sync:`, error)
        }
    }

    private startTypingIndicator(channel: TextChannel | null | undefined) {
        if (!channel) {
            return () => {}
        }
        const sendTyping = () => {
            void channel.sendTyping().catch(() => {})
        }
        sendTyping()
        const timer = setInterval(sendTyping, 8_000)
        timer.unref?.()
        return () => clearInterval(timer)
    }

    private async loadSnapshotForTarget(target: DiscordChannelTarget): Promise<DiscordWorkspaceSnapshot> {
        const saved = Object.entries((await readDiscordMappings()).workspaces)
            .find(([workspaceId]) => workspaceId === target.workspaceId)
        if (!saved) {
            throw new Error('Workspace mapping not found.')
        }
        const workspace = await getSavedWorkspace(target.workspaceId)
        if (!workspace.ok) {
            throw new Error(workspace.error)
        }
        return workspaceSnapshotFromSaved(workspace.workspace)
    }

}

export const discordIntegrationService = new DiscordIntegrationService()
