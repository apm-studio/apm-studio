import {
    ActionRowBuilder,
    AutocompleteInteraction,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    Events,
    GatewayIntentBits,
    Guild,
    Message,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    PermissionsBitField,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
    type ButtonInteraction,
    type CacheType,
    type CommandInteraction,
    type Interaction,
} from 'discord.js'
import { randomUUID } from 'crypto'
import type { QuestionAnswer, PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2'
import type { ActThreadSummary } from '../../../shared/act-types.js'
import { listSavedWorkspaces, getSavedWorkspace } from '../workspace-service.js'
import { subscribeActRuntimeEvents } from '../act-runtime/act-runtime-events.js'
import {
    getOrCreateWorkspaceMapping,
    readDiscordConfig,
    readDiscordMappings,
    redactDiscordConfig,
    updateDiscordMappings,
    writeDiscordConfig,
    type DiscordChannelTarget,
    type DiscordIntegrationConfig,
    type DiscordMappings,
    type RedactedDiscordIntegrationConfig,
} from './config-store.js'
import {
    archiveCategoryName,
    actCategoryName,
    actThreadMappingKey,
    controlChannelName,
    performerCategoryName,
    performerThreadMappingKey,
    pruneStaleDiscordThreadMappings,
    isStudioEntityCategoryName,
    threadChannelName,
    unnamedThreadNameFor,
    workspaceCategoryName,
} from './sync-plan.js'
import {
    createActThreadForDiscord,
    describeDiscordSessionBlock,
    ensureActParticipantSession,
    ensureStandaloneSession,
    findPendingStudioInteraction,
    findWorkspaceAct,
    findWorkspacePerformer,
    getLatestDiscordAssistantMessageId,
    isDiscordSessionRunning,
    listDiscordBackfillMessages,
    listActThreadsForDiscord,
    listStandaloneThreadsForDiscord,
    rejectDiscordQuestion,
    resolveActParticipantPerformer,
    respondDiscordPermission,
    respondDiscordQuestion,
    sendActParticipantDiscordMessage,
    sendPerformerDiscordMessage,
    waitForAssistantReply,
    type DiscordAssistantReply,
    type DiscordActSnapshot,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'
import {
    isDiscordActorAuthorized,
    summarizeDiscordAccess,
    type DiscordActorAccess,
} from './access-control.js'

type DiscordStatus = {
    config: RedactedDiscordIntegrationConfig
    online: boolean
    connectionState: 'offline' | 'starting' | 'online' | 'reconnecting'
    botUser?: { id: string; username: string }
    applicationId?: string
    inviteUrl?: string
    guilds: Array<{ id: string; name: string }>
    selectedGuild?: { id: string; name: string }
    missingPermissions: string[]
    messageContentLikelyMissing: boolean
    access: ReturnType<typeof summarizeDiscordAccess>
    lastError?: string
    lastReadyAt?: number
    lastDisconnectAt?: number
}

type SyncResult = {
    ok: true
    workspaceId?: string
    syncedWorkspaces?: number
    failedWorkspaces?: Array<{ workspaceId: string; workingDir: string; error: string }>
    categoryId?: string
    menuChannelId?: string
}

type SavedDiscordWorkspaceSnapshot = DiscordWorkspaceSnapshot & {
    schemaVersion?: number
    markdownEditors?: unknown[]
    canvasTerminals?: unknown[]
}

const REQUIRED_PERMISSIONS = [
    ['View channels', PermissionFlagsBits.ViewChannel],
    ['Manage channels', PermissionFlagsBits.ManageChannels],
    ['Send messages', PermissionFlagsBits.SendMessages],
    ['Read message history', PermissionFlagsBits.ReadMessageHistory],
] as const
const MAX_DISCORD_PROMPT_CHARS = 1800
const ACT_THREAD_SYNC_POLL_MS = 1_500
const ACT_THREAD_SYNC_TIMEOUT_MS = 30 * 60_000
const ACT_THREAD_IDLE_CONFIRMATIONS = 80
const PENDING_INTERACTION_TTL_MS = 24 * 60 * 60_000
const DISCORD_SEND_RETRY_DELAYS_MS = [250, 1_000] as const
const DISCORD_SYNC_OPERATION_TIMEOUT_MS = 8_000
const DISCORD_SYNC_BEST_EFFORT_TIMEOUT_MS = 750

function discordInviteUrl(applicationId: string) {
    const permissions = new PermissionsBitField([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
    ]).bitfield.toString()
    return `https://discord.com/oauth2/authorize?client_id=${applicationId}&permissions=${permissions}&scope=bot%20applications.commands`
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function timeoutError(label: string, timeoutMs: number) {
    return new Error(`Timed out while ${label} after ${timeoutMs}ms`)
}

function chunkDiscordMessage(content: string) {
    const chunks: string[] = []
    let rest = content.trim() || 'Done.'
    while (rest.length > 0) {
        chunks.push(rest.slice(0, 1900))
        rest = rest.slice(1900)
    }
    return chunks
}

function truncateDiscordText(value: string, max: number) {
    const compact = value.replace(/\s+/g, ' ').trim()
    return compact.length > max ? `${compact.slice(0, Math.max(0, max - 1))}…` : compact
}

function permissionTitle(request: PermissionRequest) {
    const permission = request.permission || 'permission.required'
    const parts = permission.split('.')
    const raw = parts[parts.length - 1] || 'Permission'
    return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ')
}

function formatPermissionPrompt(request: PermissionRequest) {
    const lines = [
        `**Permission Required: ${truncateDiscordText(permissionTitle(request), 80)}**`,
        `Permission: \`${truncateDiscordText(request.permission || 'unknown', 120)}\``,
    ]
    if (request.patterns?.length) {
        lines.push(`Patterns: ${request.patterns.slice(0, 8).map((pattern) => `\`${truncateDiscordText(pattern, 80)}\``).join(', ')}`)
    }
    if (request.always?.length) {
        lines.push(`Allow Always will auto-approve: ${request.always.slice(0, 8).map((pattern) => `\`${truncateDiscordText(pattern, 80)}\``).join(', ')}`)
    }
    return lines.join('\n')
}

function formatQuestionPrompt(request: QuestionRequest) {
    const questions = request.questions || []
    const lines = ['**Studio Question**']
    questions.slice(0, 5).forEach((question, index) => {
        lines.push(`**${index + 1}. ${truncateDiscordText(question.header || 'Question', 80)}**`)
        lines.push(truncateDiscordText(question.question || '', 300))
        if (question.options?.length) {
            lines.push(`Options: ${question.options.slice(0, 8).map((option) => `\`${truncateDiscordText(option.label, 60)}\``).join(', ')}`)
        }
    })
    if (questions.length > 5) {
        lines.push(`This question flow has ${questions.length} questions. Discord can answer the first 5 here; use Studio for the full wizard.`)
    }
    return lines.join('\n')
}

function workspaceSnapshotFromSaved(workspace: SavedDiscordWorkspaceSnapshot): DiscordWorkspaceSnapshot {
    return {
        workingDir: workspace.workingDir,
        performers: workspace.performers || [],
        acts: workspace.acts || [],
    } as DiscordWorkspaceSnapshot
}

function workspaceLabel(workingDir: string) {
    const normalized = workingDir.trim().replace(/[\\/]+$/, '')
    return normalized.split(/[/\\]/).pop() || workingDir || 'workspace'
}

function participantDisplayName(act: DiscordActSnapshot, participantKey: string) {
    return act.participants[participantKey]?.displayName?.trim() || participantKey
}

class DiscordIntegrationService {
    private client: Client | null = null
    private startPromise: Promise<void> | null = null
    private lastError: string | undefined
    private connectionState: DiscordStatus['connectionState'] = 'offline'
    private lastReadyAt: number | undefined
    private lastDisconnectAt: number | undefined
    private messageContentLikelyMissing = false
    private activeDiscordSessionTurns = new Set<string>()
    private activeActThreadSyncs = new Map<string, { promise: Promise<number>; expiresAt: number }>()
    private actRuntimeUnsubscribers = new Map<string, () => void>()

    async initialize() {
        const config = await readDiscordConfig()
        if (config.enabled && config.token) {
            await this.start().catch((error) => {
                this.lastError = error instanceof Error ? error.message : String(error)
                console.warn('[discord] Failed to start Discord integration:', this.lastError)
            })
        }
    }

    async getStatus(): Promise<DiscordStatus> {
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

    async updateConfig(patch: {
        enabled?: boolean
        token?: string
        guildId?: string
        clearToken?: boolean
    }) {
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
        } satisfies DiscordStatus
    }

    async syncAllWorkspaces(): Promise<SyncResult> {
        await this.ensureReady()
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

    async syncWorkspace(workspaceId: string): Promise<SyncResult> {
        await this.ensureReady()
        const config = await readDiscordConfig()
        const guild = await this.requireGuild(config)
        const saved = await getSavedWorkspace(workspaceId)
        if (!saved.ok) {
            throw new Error(`${saved.error} (${workspaceId})`)
        }
        const snapshot = workspaceSnapshotFromSaved(saved.workspace as SavedDiscordWorkspaceSnapshot)
        this.ensureActRuntimeSubscription(snapshot.workingDir)

        let result: Awaited<ReturnType<typeof updateDiscordMappings>>
        try {
            const savedWorkspaces = await listSavedWorkspaces()
            result = await updateDiscordMappings(async (mappings) => {
                const workspaceMapping = getOrCreateWorkspaceMapping(mappings, workspaceId, snapshot.workingDir)
                mappings.version = 2
                const archiveCategory = await this.ensureCategory(guild, mappings.archiveCategoryId, archiveCategoryName())
                mappings.archiveCategoryId = archiveCategory.id
                const workspaceCategoryIdUseCounts = this.workspaceCategoryIdUseCounts(mappings)
                const reusableWorkspaceCategoryId = workspaceMapping.categoryId
                    && workspaceCategoryIdUseCounts.get(workspaceMapping.categoryId) === 1
                    ? workspaceMapping.categoryId
                    : undefined
                const activeCategory = await this.ensureCategory(
                    guild,
                    reusableWorkspaceCategoryId,
                    workspaceCategoryName(snapshot.workingDir),
                )
                void this.runDiscordSyncBestEffort(`position active workspace category ${activeCategory.id}`, () => activeCategory.setPosition(0))
                mappings.activeCategoryId = activeCategory.id
                const obsoleteGenericCategoryIds = [
                    mappings.performerCategoryId,
                    mappings.actCategoryId,
                ].filter((categoryId): categoryId is string => !!categoryId)
                await this.deleteCategories(guild, obsoleteGenericCategoryIds)
                delete mappings.performerCategoryId
                delete mappings.actCategoryId
                mappings.activeWorkspaceId = workspaceId
                workspaceMapping.categoryId = activeCategory.id
                workspaceMapping.performerCategories ||= {}
                workspaceMapping.actCategories ||= {}
                workspaceMapping.performerThreadChannels ||= {}
                workspaceMapping.actThreadChannels ||= {}
                const menuChannel = await this.ensureTextChannel(
                    guild,
                    mappings.menuChannelId || workspaceMapping.menuChannelId,
                    controlChannelName(),
                    activeCategory.id,
                    `APM Studio control for ${snapshot.workingDir}`,
                )
                void this.runDiscordSyncBestEffort(`position Discord workspace menu ${menuChannel.id}`, () => menuChannel.setPosition(0))
                mappings.menuChannelId = menuChannel.id
                workspaceMapping.menuChannelId = menuChannel.id
                mappings.channels[menuChannel.id] = {
                    kind: 'menu',
                    workspaceId,
                    workingDir: snapshot.workingDir,
                }

                const originalPerformerThreadChannels = { ...(workspaceMapping.performerThreadChannels || {}) }
                const originalActThreadChannels = { ...(workspaceMapping.actThreadChannels || {}) }
                const originalBackfilledMessageIds = { ...(workspaceMapping.backfilledMessageIds || {}) }
                const [performerThreadEntries, actThreadEntries] = await Promise.all([
                    Promise.all((snapshot.performers || []).map(async (performer) => {
                        const threads = await listStandaloneThreadsForDiscord(snapshot.workingDir, performer.id)
                            .catch((error) => {
                                console.warn('[discord] Failed to list agent threads during workspace sync cleanup:', {
                                    workspaceId,
                                    performerId: performer.id,
                                    error,
                                })
                                return null
                            })
                        return [performer.id, threads?.map((thread) => thread.id) || null] as const
                    })),
                    Promise.all((snapshot.acts || []).map(async (act) => {
                        const result = await listActThreadsForDiscord(snapshot.workingDir, act.id)
                            .catch((error) => {
                                console.warn('[discord] Failed to list Team threads during workspace sync cleanup:', {
                                    workspaceId,
                                    actId: act.id,
                                    error,
                                })
                                return null
                            })
                        return [act.id, result?.threads.map((thread) => thread.id) || null] as const
                    })),
                ])
                const performerThreadIds = Object.fromEntries(performerThreadEntries)
                const actThreadIds = Object.fromEntries(actThreadEntries)
                const performerIds = new Set((snapshot.performers || []).map((performer) => performer.id))
                const actIds = new Set((snapshot.acts || []).map((act) => act.id))
                const obsoletePerformerCategoryEntries = Object.entries(workspaceMapping.performerCategories)
                    .filter(([performerId]) => !performerIds.has(performerId))
                const obsoleteActCategoryEntries = Object.entries(workspaceMapping.actCategories)
                    .filter(([actId]) => !actIds.has(actId))
                const obsoleteWorkspaceCategoryIds = [
                    ...obsoletePerformerCategoryEntries.map(([, categoryId]) => categoryId),
                    ...obsoleteActCategoryEntries.map(([, categoryId]) => categoryId),
                ].filter((categoryId): categoryId is string => !!categoryId)
                // Workspace sync is the authoritative Discord cleanup pass for channels whose Studio thread is gone.
                const staleChannelIds = new Set(pruneStaleDiscordThreadMappings({
                    mapping: workspaceMapping,
                    performerThreadIds,
                    actThreadIds,
                }).staleChannelIds)
                for (const [performerId, channelId] of Object.entries(workspaceMapping.performerChannels || {})) {
                    if (performerIds.has(performerId)) {
                        continue
                    }
                    staleChannelIds.add(channelId)
                    delete workspaceMapping.performerChannels?.[performerId]
                }
                for (const [channelId, target] of Object.entries(mappings.channels)) {
                    if (target.workspaceId !== workspaceId) {
                        continue
                    }
                    if (target.kind === 'performer') {
                        const liveThreadIds = performerThreadIds[target.performerId] || []
                        if (!performerIds.has(target.performerId) || (target.sessionId && !liveThreadIds.includes(target.sessionId))) {
                            staleChannelIds.add(channelId)
                        }
                    } else if (target.kind === 'act-thread') {
                        const liveThreadIds = actThreadIds[target.actId] || []
                        if (!actIds.has(target.actId) || !liveThreadIds.includes(target.threadId)) {
                            staleChannelIds.add(channelId)
                        }
                    }
                }
                const cleanedChannelIds = await this.deleteTextChannels(
                    guild,
                    Array.from(staleChannelIds),
                    'APM Studio stale thread cleanup',
                )
                for (const [key, channelId] of Object.entries(originalPerformerThreadChannels)) {
                    if (!cleanedChannelIds.has(channelId)) {
                        workspaceMapping.performerThreadChannels[key] = channelId
                    }
                }
                for (const [key, channelId] of Object.entries(originalActThreadChannels)) {
                    if (!cleanedChannelIds.has(channelId)) {
                        workspaceMapping.actThreadChannels[key] = channelId
                    }
                }
                for (const [performerId, channelId] of Object.entries(workspaceMapping.performerChannels || {})) {
                    if (cleanedChannelIds.has(channelId)) {
                        delete workspaceMapping.performerChannels?.[performerId]
                    }
                }
                for (const [key, channelId] of Object.entries(workspaceMapping.performerThreadChannels || {})) {
                    if (cleanedChannelIds.has(channelId)) {
                        delete workspaceMapping.performerThreadChannels?.[key]
                    }
                }
                for (const [key, channelId] of Object.entries(workspaceMapping.actThreadChannels || {})) {
                    if (cleanedChannelIds.has(channelId)) {
                        delete workspaceMapping.actThreadChannels?.[key]
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
                const cleanedWorkspaceCategoryIds = await this.deleteCategories(guild, obsoleteWorkspaceCategoryIds)
                for (const [performerId, categoryId] of obsoletePerformerCategoryEntries) {
                    if (cleanedWorkspaceCategoryIds.has(categoryId)) {
                        delete workspaceMapping.performerCategories?.[performerId]
                    }
                }
                for (const [actId, categoryId] of obsoleteActCategoryEntries) {
                    if (cleanedWorkspaceCategoryIds.has(categoryId)) {
                        delete workspaceMapping.actCategories?.[actId]
                    }
                }

                for (const [mappedWorkspaceId, mappedWorkspace] of Object.entries(mappings.workspaces)) {
                    if (mappedWorkspaceId === workspaceId) continue
                    const channelIds = [
                        mappedWorkspace.menuChannelId === menuChannel.id ? undefined : mappedWorkspace.menuChannelId,
                        ...Object.values(mappedWorkspace.performerChannels || {}),
                        ...Object.values(mappedWorkspace.performerThreadChannels || {}),
                        ...Object.values(mappedWorkspace.actThreadChannels || {}),
                    ].filter((channelId): channelId is string => !!channelId)
                    await this.moveChannelsToCategory(guild, channelIds, archiveCategory.id)
                    const performerCategoryEntries = Object.entries(mappedWorkspace.performerCategories || {})
                    const actCategoryEntries = Object.entries(mappedWorkspace.actCategories || {})
                    const cleanedCategoryIds = await this.deleteCategories(guild, [
                        ...performerCategoryEntries.map(([, categoryId]) => categoryId),
                        ...actCategoryEntries.map(([, categoryId]) => categoryId),
                    ])
                    for (const [performerId, categoryId] of performerCategoryEntries) {
                        if (cleanedCategoryIds.has(categoryId)) {
                            delete mappedWorkspace.performerCategories?.[performerId]
                        }
                    }
                    for (const [actId, categoryId] of actCategoryEntries) {
                        if (cleanedCategoryIds.has(categoryId)) {
                            delete mappedWorkspace.actCategories?.[actId]
                        }
                    }
                }
                await this.deleteUnmappedEmptyEntityCategories(guild, mappings)

                let categoryPosition = 1
                for (const performer of snapshot.performers || []) {
                    const category = await this.ensureCategory(
                        guild,
                        workspaceMapping.performerCategories[performer.id],
                        performerCategoryName(performer.name),
                    )
                    workspaceMapping.performerCategories[performer.id] = category.id
                    void this.runDiscordSyncBestEffort(`position agent category ${category.id}`, () => category.setPosition(categoryPosition))
                    categoryPosition += 1
                    const threadChannelIds = Object.entries(workspaceMapping.performerThreadChannels || {})
                        .filter(([key]) => key.startsWith(`${performer.id}:`))
                        .map(([, channelId]) => channelId)
                    await this.moveChannelsToCategory(guild, [
                        workspaceMapping.performerChannels?.[performer.id],
                        ...threadChannelIds,
                    ].filter((channelId): channelId is string => !!channelId), category.id)
                }

                for (const act of snapshot.acts || []) {
                    const category = await this.ensureCategory(
                        guild,
                        workspaceMapping.actCategories[act.id],
                        actCategoryName(act.name),
                    )
                    workspaceMapping.actCategories[act.id] = category.id
                    void this.runDiscordSyncBestEffort(`position Team category ${category.id}`, () => category.setPosition(categoryPosition))
                    categoryPosition += 1
                    const threadChannelIds = Object.entries(workspaceMapping.actThreadChannels || {})
                        .filter(([key]) => key.startsWith(`${act.id}:`))
                        .map(([, channelId]) => channelId)
                    await this.moveChannelsToCategory(guild, threadChannelIds, category.id)
                }
                await this.deleteCategories(guild, obsoleteGenericCategoryIds)
                await this.runDiscordSyncBestEffort(
                    `position archive category ${archiveCategory.id} at bottom`,
                    () => this.moveCategoryToBottom(guild, archiveCategory.id),
                    3_000,
                )
                await this.deleteInactiveWorkspaceRootCategories(
                    guild,
                    mappings,
                    workspaceId,
                    activeCategory.id,
                    archiveCategory.id,
                )

                await this.runDiscordSyncBestEffort(
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

    private async restartForConfig(config: DiscordIntegrationConfig) {
        if (!config.enabled || !config.token) {
            await this.stop()
            return
        }
        await this.start(true)
    }

    private resolveConnectionState(): DiscordStatus['connectionState'] {
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

            client.on(Events.ClientReady, () => {
                this.connectionState = 'online'
                this.lastReadyAt = Date.now()
            })
            client.on(Events.Error, (error) => {
                this.noteDiscordIssue('Discord client error', error)
            })
            client.on(Events.ShardError, (error, shardId) => {
                this.noteDiscordIssue(`Discord shard ${shardId} error`, error)
            })
            client.on(Events.ShardDisconnect, (event, shardId) => {
                this.connectionState = 'reconnecting'
                this.lastDisconnectAt = Date.now()
                const code = typeof event.code === 'number' ? ` code=${event.code}` : ''
                const reason = typeof event.reason === 'string' && event.reason ? ` reason=${event.reason}` : ''
                this.noteDiscordIssue(`Discord shard ${shardId} disconnected${code}${reason}`)
            })
            client.on(Events.ShardReconnecting, (shardId) => {
                this.connectionState = 'reconnecting'
                this.noteDiscordIssue(`Discord shard ${shardId} reconnecting`)
            })
            client.on(Events.ShardReady, (shardId) => {
                this.connectionState = 'online'
                this.lastReadyAt = Date.now()
                console.info(`[discord] Discord shard ${shardId} ready.`)
            })
            client.on(Events.ShardResume, (shardId, replayedEvents) => {
                this.connectionState = 'online'
                this.lastReadyAt = Date.now()
                console.info(`[discord] Discord shard ${shardId} resumed after replaying ${replayedEvents} event(s).`)
            })
            client.on(Events.InteractionCreate, (interaction) => {
                void this.handleInteraction(interaction).catch((error) => {
                    console.error('[discord] Interaction failed:', error)
                    this.lastError = error instanceof Error ? error.message : String(error)
                    void this.replyInteractionFailure(interaction, error)
                })
            })
            client.on(Events.MessageCreate, (message) => {
                void this.handleMessage(message).catch((error) => {
                    console.error('[discord] Message handling failed:', error)
                    if (message.channel?.isTextBased()) {
                        void message.reply({
                            content: `Studio could not handle that message: ${error instanceof Error ? error.message : String(error)}`,
                            allowedMentions: { parse: [] },
                        }).catch(() => {})
                    }
                })
            })

            const ready = new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Discord bot did not become ready in time.')), 15_000)
                client.once(Events.ClientReady, () => {
                    clearTimeout(timeout)
                    resolve()
                })
                client.once(Events.Error, (error) => {
                    clearTimeout(timeout)
                    reject(error)
                })
            })

            await client.login(config.token)
            if (!client.isReady()) {
                await ready
            }
            this.connectionState = 'online'
            this.lastReadyAt = Date.now()
            await this.registerCommands()
            await this.subscribeMappedActRuntimes()
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
        for (const unsubscribe of this.actRuntimeUnsubscribers.values()) {
            unsubscribe()
        }
        this.actRuntimeUnsubscribers.clear()
        this.activeActThreadSyncs.clear()
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

    private async subscribeMappedActRuntimes() {
        const mappings = await readDiscordMappings().catch(() => null)
        if (!mappings) {
            return
        }
        for (const workspace of Object.values(mappings.workspaces || {})) {
            if (workspace.workingDir) {
                this.ensureActRuntimeSubscription(workspace.workingDir)
            }
        }
    }

    private ensureActRuntimeSubscription(workingDir: string) {
        if (!workingDir || this.actRuntimeUnsubscribers.has(workingDir)) {
            return
        }
        const unsubscribe = subscribeActRuntimeEvents(workingDir, (event) => {
            if (event.type !== 'act.thread.updated') {
                return
            }
            void this.handleActRuntimeThreadUpdated(workingDir, event.properties.thread).catch((error) => {
                console.error('[discord] Team runtime update sync failed:', error)
            })
        })
        this.actRuntimeUnsubscribers.set(workingDir, unsubscribe)
    }

    private async handleActRuntimeThreadUpdated(workingDir: string, thread: ActThreadSummary) {
        const client = this.client
        if (!client?.isReady()) {
            return
        }
        const mappings = await readDiscordMappings()
        const targets = Object.entries(mappings.channels).filter(([, target]) =>
            target.kind === 'act-thread'
            && target.workingDir === workingDir
            && target.actId === thread.actId
            && target.threadId === thread.id,
        ) as Array<[string, Extract<DiscordChannelTarget, { kind: 'act-thread' }>]>

        for (const [channelId, target] of targets) {
            const channel = await client.channels.fetch(channelId).catch(() => null)
            if (!(channel instanceof TextChannel)) {
                continue
            }
            const snapshot = await this.loadSnapshotForTarget(target).catch(() => null)
            const act = snapshot ? findWorkspaceAct(snapshot, target.actId) : null
            if (!act) {
                continue
            }
            const running = await this.isActThreadRunning(target, thread, { ignoreDiscordTurnLocks: true }).catch(() => false)
            if (running) {
                await channel.sendTyping().catch(() => {})
            }
            void this.syncActThreadUntilIdle({
                channel,
                target,
                act,
                thread,
                limitPerParticipant: 20,
            }).catch((error) => {
                console.error('[discord] Team thread sync from runtime event failed:', error)
            })
        }
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
        const commands = [
            new SlashCommandBuilder()
                .setName('workspace')
                .setDescription('Studio workspace controls')
                .addSubcommand((command) =>
                    command.setName('active').setDescription('Show the active Studio workspace'),
                )
                .addSubcommand((command) =>
                    command.setName('control').setDescription('Refresh the Studio control panel for the active workspace'),
                )
                .addSubcommand((command) =>
                    command.setName('sync').setDescription('Sync the active Studio workspace into Discord'),
                )
                .addSubcommand((command) =>
                    command
                        .setName('switch')
                        .setDescription('Switch the active Studio workspace by saved workspace id or folder name')
                        .addStringOption((option) =>
                            option
                                .setName('workspace')
                                .setDescription('Saved workspace id, working directory, or folder name')
                                .setRequired(true),
                        ),
                )
                .toJSON(),
            new SlashCommandBuilder()
                .setName('agent')
                .setDescription('APM Studio agent controls')
                .addSubcommand((command) =>
                    command.setName('new').setDescription('Create a new standalone agent thread from this agent channel'),
                )
                .toJSON(),
            new SlashCommandBuilder()
                .setName('team')
                .setDescription('APM Studio Team controls')
                .addSubcommand((command) =>
                    command.setName('participants').setDescription('Show the agents for this Team thread'),
                )
                .addSubcommand((command) =>
                    command
                        .setName('message')
                        .setDescription('Send a message to a Team agent from this Team thread')
                        .addStringOption((option) =>
                            option
                                .setName('agent')
                                .setDescription('Agent in the current Team thread')
                                .setRequired(true)
                                .setAutocomplete(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('message')
                                .setDescription('Message to send')
                                .setRequired(true)
                                .setMaxLength(MAX_DISCORD_PROMPT_CHARS),
                        ),
                )
                .addSubcommand((command) =>
                    command.setName('sync').setDescription('Backfill recent agent messages for this Team thread'),
                )
                .toJSON(),
        ]

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

    private async ensureCategory(guild: Guild, channelId: string | undefined, name: string) {
        const existing = channelId
            ? await this.withDiscordSyncTimeout(`fetch Discord category ${channelId}`, () => guild.channels.fetch(channelId, { force: true }).catch(() => null))
            : null
        if (existing?.type === ChannelType.GuildCategory) {
            if (existing.name !== name) {
                await this.runDiscordSyncBestEffort(`rename Discord category ${existing.id}`, () => existing.setName(name), 3_000)
            }
            return existing
        }
        return this.withDiscordSyncTimeout(`create Discord category ${name}`, () => guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
        }))
    }

    private async ensureTextChannel(
        guild: Guild,
        channelId: string | undefined,
        name: string,
        parentId: string,
        topic: string,
    ) {
        const existing = channelId
            ? await this.withDiscordSyncTimeout(`fetch Discord text channel ${channelId}`, () => guild.channels.fetch(channelId, { force: true }).catch(() => null))
            : null
        if (existing?.type === ChannelType.GuildText) {
            let channel = existing as TextChannel
            if (channel.name !== name) {
                await this.runDiscordSyncBestEffort(`rename Discord text channel ${channel.id}`, () => channel.setName(name))
            }
            if (channel.parentId !== parentId) {
                const moved = await this.withDiscordSyncTimeout(
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
                await this.runDiscordSyncBestEffort(`update Discord text channel topic ${channel.id}`, () => channel.setTopic(topic))
            }
            return channel
        }
        return this.withDiscordSyncTimeout(`create Discord text channel ${name}`, () => guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: parentId,
            topic,
        }))
    }

    private async moveChannelsToCategory(guild: Guild, channelIds: string[], parentId: string) {
        for (const channelId of Array.from(new Set(channelIds))) {
            const channel = await this.withDiscordSyncTimeout(
                `fetch Discord channel ${channelId}`,
                () => guild.channels.fetch(channelId, { force: true }).catch(() => null),
            ).catch(() => null)
            if (channel?.type === ChannelType.GuildText && channel.parentId !== parentId) {
                await this.runDiscordSyncBestEffort(`move Discord text channel ${channel.id}`, () => channel.setParent(parentId))
            }
        }
    }

    private async moveCategoryToBottom(guild: Guild, categoryId: string) {
        const channels = await this.withDiscordSyncTimeout(
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

    private async deleteTextChannels(guild: Guild, channelIds: string[], reason: string) {
        const cleanedChannelIds = new Set<string>()
        for (const channelId of Array.from(new Set(channelIds))) {
            const channel = await this.withDiscordSyncTimeout(
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
                    await this.withDiscordSyncTimeout(`delete stale Discord text channel ${channel.id}`, () => channel.delete(reason))
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

    private workspaceCategoryIdUseCounts(mappings: DiscordMappings) {
        const counts = new Map<string, number>()
        for (const mapping of Object.values(mappings.workspaces)) {
            if (!mapping.categoryId) {
                continue
            }
            counts.set(mapping.categoryId, (counts.get(mapping.categoryId) || 0) + 1)
        }
        return counts
    }

    private mappedDiscordEntityCategoryIds(mappings: DiscordMappings) {
        const ids = new Set<string>()
        for (const mapping of Object.values(mappings.workspaces)) {
            for (const categoryId of Object.values(mapping.performerCategories || {})) {
                ids.add(categoryId)
            }
            for (const categoryId of Object.values(mapping.actCategories || {})) {
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

    private async fetchCategoryChildCounts(guild: Guild, label: string) {
        const channels = await this.withDiscordSyncTimeout(
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

    private async deleteUnmappedEmptyEntityCategories(guild: Guild, mappings: DiscordMappings) {
        const channels = await this.withDiscordSyncTimeout(
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

    private async deleteInactiveWorkspaceRootCategories(
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

    private async deleteCategories(
        guild: Guild,
        categoryIds: string[],
        reason = 'APM Studio inactive workspace category cleanup',
    ) {
        const cleanedCategoryIds = new Set<string>()
        for (const categoryId of Array.from(new Set(categoryIds))) {
            const channel = await this.withDiscordSyncTimeout(
                `fetch obsolete Discord category ${categoryId}`,
                () => guild.channels.fetch(categoryId, { force: true }).catch(() => null),
            ).catch(() => null)
            if (!channel) {
                cleanedCategoryIds.add(categoryId)
                continue
            }
            if (channel?.type === ChannelType.GuildCategory) {
                try {
                    await this.withDiscordSyncTimeout(
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

    private buildWorkspaceMenuComponents(
        workspaceId: string,
        snapshot: DiscordWorkspaceSnapshot,
        savedWorkspaces: Array<{ id: string; workingDir: string }>,
    ) {
        const rows: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = []
        if (savedWorkspaces.length > 0) {
            rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`apm:workspace:${workspaceId}`)
                    .setPlaceholder('Switch workspace')
                    .addOptions(savedWorkspaces.slice(0, 25).map((workspace) => ({
                        label: workspaceLabel(workspace.workingDir).slice(0, 100),
                        value: workspace.id,
                        description: workspace.workingDir.slice(0, 100),
                        default: workspace.id === workspaceId,
                    }))),
            ))
        }
        const performers = (snapshot.performers || []).slice(0, 25)
        if (performers.length > 0) {
            rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`apm:performer:${workspaceId}`)
                    .setPlaceholder('Open agent threads')
                    .addOptions(performers.map((performer) => ({
                        label: performer.name.slice(0, 100),
                        value: performer.id,
                        description: performer.model ? `${performer.model.provider}/${performer.model.modelId}`.slice(0, 100) : 'No model selected',
                    }))),
            ))
        }

        const acts = (snapshot.acts || []).slice(0, 25)
        if (acts.length > 0) {
            rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`apm:act:${workspaceId}`)
                    .setPlaceholder('Open Team threads')
                    .addOptions(acts.map((act) => ({
                        label: act.name.slice(0, 100),
                        value: act.id,
                        description: `${Object.keys(act.participants || {}).length} participants, ${act.relations?.length || 0} relations`.slice(0, 100),
                    }))),
            ))
        }

        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`apm:sync:${workspaceId}`)
                .setLabel('Sync workspace')
                .setStyle(ButtonStyle.Secondary),
        ))
        return rows.slice(0, 5)
    }

    private async postWorkspaceMenu(
        channel: TextChannel,
        workspaceId: string,
        snapshot: DiscordWorkspaceSnapshot,
        savedWorkspaces: Array<{ id: string; workingDir: string }>,
    ) {
        const performerCount = snapshot.performers?.length || 0
        const actCount = snapshot.acts?.length || 0
        await this.withDiscordSyncTimeout(`post Discord workspace menu ${channel.id}`, () => channel.send({
            content: [
                `**APM Studio**`,
                `Workspace: \`${snapshot.workingDir}\``,
                `Agents: ${performerCount} | Teams: ${actCount}`,
            ].join('\n'),
            components: this.buildWorkspaceMenuComponents(workspaceId, snapshot, savedWorkspaces),
            allowedMentions: { parse: [] },
        }))
    }

    private async registerPendingInteraction(params: {
        kind: 'permission' | 'question'
        workspaceId: string
        channelId: string
        workingDir: string
        sessionId: string
        request: PermissionRequest | QuestionRequest
    }) {
        const id = randomUUID().replace(/-/g, '').slice(0, 16)
        await updateDiscordMappings((mappings) => {
            mappings.pendingInteractions ||= {}
            const expiresBefore = Date.now() - PENDING_INTERACTION_TTL_MS
            for (const [pendingId, pending] of Object.entries(mappings.pendingInteractions)) {
                if (typeof pending.createdAt !== 'number' || pending.createdAt < expiresBefore) {
                    delete mappings.pendingInteractions[pendingId]
                }
            }
            mappings.pendingInteractions[id] = {
                kind: params.kind,
                workspaceId: params.workspaceId,
                channelId: params.channelId,
                workingDir: params.workingDir,
                sessionId: params.sessionId,
                request: params.request as unknown as Record<string, unknown>,
                createdAt: Date.now(),
            }
        })
        return id
    }

    private async clearPendingInteraction(id: string) {
        await updateDiscordMappings((mappings) => {
            if (mappings.pendingInteractions) {
                delete mappings.pendingInteractions[id]
            }
        })
    }

    private async withDiscordSendRetry<T>(label: string, operation: () => Promise<T>) {
        let lastError: unknown
        for (let attempt = 0; attempt <= DISCORD_SEND_RETRY_DELAYS_MS.length; attempt += 1) {
            try {
                return await operation()
            } catch (error) {
                lastError = error
                const delay = DISCORD_SEND_RETRY_DELAYS_MS[attempt]
                if (typeof delay !== 'number') {
                    break
                }
                await sleep(delay)
            }
        }
        this.noteDiscordIssue(`Discord send failed (${label})`, lastError)
        throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }

    private sendChannelMessage(channel: TextChannel, options: Parameters<TextChannel['send']>[0]) {
        return this.withDiscordSendRetry('channel message', () => channel.send(options))
    }

    private replyToMessage(message: Message, options: Parameters<Message['reply']>[0]) {
        return this.withDiscordSendRetry('message reply', () => message.reply(options))
    }

    private async postAssistantReply(message: Message, target: DiscordChannelTarget, sessionId: string, reply: DiscordAssistantReply) {
        if (reply.kind === 'message') {
            for (const chunk of chunkDiscordMessage(reply.content)) {
                await this.replyToMessage(message, { content: chunk, allowedMentions: { parse: [] } })
            }
            return
        }

        if (reply.kind === 'permission') {
            const pendingId = await this.registerPendingInteraction({
                kind: 'permission',
                workspaceId: target.workspaceId,
                channelId: message.channelId,
                workingDir: target.workingDir,
                sessionId,
                request: reply.request,
            })
            try {
                await this.replyToMessage(message, {
                    content: formatPermissionPrompt(reply.request),
                    components: [
                        new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder().setCustomId(`apm:perm:${pendingId}:reject`).setLabel('Deny').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId(`apm:perm:${pendingId}:once`).setLabel('Allow Once').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`apm:perm:${pendingId}:always`).setLabel('Allow Always').setStyle(ButtonStyle.Primary),
                        ),
                    ],
                    allowedMentions: { parse: [] },
                })
            } catch (error) {
                await this.clearPendingInteraction(pendingId).catch(() => {})
                throw error
            }
            return
        }

        const pendingId = await this.registerPendingInteraction({
            kind: 'question',
            workspaceId: target.workspaceId,
            channelId: message.channelId,
            workingDir: target.workingDir,
            sessionId,
            request: reply.request,
        })
        try {
            await this.replyToMessage(message, {
                content: formatQuestionPrompt(reply.request),
                components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`apm:q-answer:${pendingId}`).setLabel('Answer').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`apm:q-reject:${pendingId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                    ),
                ],
                allowedMentions: { parse: [] },
            })
        } catch (error) {
            await this.clearPendingInteraction(pendingId).catch(() => {})
            throw error
        }
    }

    private async postAssistantReplyToChannel(
        channel: TextChannel,
        pending: { workspaceId: string; workingDir: string; channelId: string },
        sessionId: string,
        reply: DiscordAssistantReply,
    ) {
        if (reply.kind === 'message') {
            for (const chunk of chunkDiscordMessage(reply.content)) {
                await this.sendChannelMessage(channel, { content: chunk, allowedMentions: { parse: [] } })
            }
            return
        }

        if (reply.kind === 'permission') {
            const pendingId = await this.registerPendingInteraction({
                kind: 'permission',
                workspaceId: pending.workspaceId,
                channelId: pending.channelId,
                workingDir: pending.workingDir,
                sessionId,
                request: reply.request,
            })
            try {
                await this.sendChannelMessage(channel, {
                    content: formatPermissionPrompt(reply.request),
                    components: [
                        new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder().setCustomId(`apm:perm:${pendingId}:reject`).setLabel('Deny').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId(`apm:perm:${pendingId}:once`).setLabel('Allow Once').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`apm:perm:${pendingId}:always`).setLabel('Allow Always').setStyle(ButtonStyle.Primary),
                        ),
                    ],
                    allowedMentions: { parse: [] },
                })
            } catch (error) {
                await this.clearPendingInteraction(pendingId).catch(() => {})
                throw error
            }
            return
        }

        const pendingId = await this.registerPendingInteraction({
            kind: 'question',
            workspaceId: pending.workspaceId,
            channelId: pending.channelId,
            workingDir: pending.workingDir,
            sessionId,
            request: reply.request,
        })
        try {
            await this.sendChannelMessage(channel, {
                content: formatQuestionPrompt(reply.request),
                components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`apm:q-answer:${pendingId}`).setLabel('Answer').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`apm:q-reject:${pendingId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                    ),
                ],
                allowedMentions: { parse: [] },
            })
        } catch (error) {
            await this.clearPendingInteraction(pendingId).catch(() => {})
            throw error
        }
    }

    private async backfillSessionHistory(params: {
        channel: TextChannel
        workspaceId: string
        workingDir: string
        sessionId: string
        assistantLabel: string
        limit?: number
        announce?: boolean
        includeUserMessages?: boolean
    }) {
        const mappings = await readDiscordMappings()
        const workspaceMapping = getOrCreateWorkspaceMapping(mappings, params.workspaceId, params.workingDir)
        workspaceMapping.backfilledMessageIds ||= {}
        const known = workspaceMapping.backfilledMessageIds[params.channel.id] || []
        const messages = await listDiscordBackfillMessages({
            workingDir: params.workingDir,
            sessionId: params.sessionId,
            assistantLabel: params.assistantLabel,
            knownMessageIds: known,
            limit: params.limit || 20,
            includeUserMessages: params.includeUserMessages,
        }).catch(() => [])
        if (messages.length === 0) {
            return 0
        }

        if (params.announce !== false) {
            await params.channel.send({
                content: `Backfilled ${messages.length} recent Studio message(s).`,
                allowedMentions: { parse: [] },
            })
        }
        for (const message of messages) {
            for (const chunk of chunkDiscordMessage(message.content)) {
                await params.channel.send({ content: chunk, allowedMentions: { parse: [] } })
            }
        }
        await updateDiscordMappings((current) => {
            const currentWorkspace = getOrCreateWorkspaceMapping(current, params.workspaceId, params.workingDir)
            currentWorkspace.backfilledMessageIds ||= {}
            currentWorkspace.backfilledMessageIds[params.channel.id] = Array.from(new Set([
                ...(currentWorkspace.backfilledMessageIds[params.channel.id] || []),
                ...messages.map((message) => message.id),
            ])).slice(-500)
        })
        return messages.length
    }

    private async handleInteraction(interaction: unknown) {
        if (this.isDiscordInteraction(interaction)) {
            const allowed = await this.authorizeInteraction(interaction)
            if (!allowed) {
                if (interaction instanceof AutocompleteInteraction) {
                    await interaction.respond([]).catch(() => {})
                    return
                }
                await this.replyUnauthorized(interaction)
                return
            }
        }
        if (interaction instanceof AutocompleteInteraction) {
            await this.handleAutocomplete(interaction)
            return
        }
        if (interaction instanceof ChatInputCommandInteraction) {
            await this.handleCommand(interaction)
            return
        }
        if (interaction instanceof StringSelectMenuInteraction) {
            await this.handleSelect(interaction)
            return
        }
        if (typeof interaction === 'object' && interaction && 'isButton' in interaction && typeof interaction.isButton === 'function' && interaction.isButton()) {
            await this.handleButton(interaction as ButtonInteraction)
            return
        }
        if (interaction instanceof ModalSubmitInteraction) {
            await this.handleModalSubmit(interaction)
        }
    }

    private isDiscordInteraction(interaction: unknown): interaction is Interaction<CacheType> {
        return typeof interaction === 'object' && interaction !== null && 'user' in interaction && 'guildId' in interaction
    }

    private interactionRoleIds(interaction: Interaction<CacheType>) {
        const member = interaction.member
        if (!member) {
            return []
        }
        const roles = (member as { roles?: unknown }).roles
        if (Array.isArray(roles)) {
            return roles.filter((role): role is string => typeof role === 'string')
        }
        if (roles && typeof roles === 'object' && 'cache' in roles) {
            const cache = (roles as { cache?: { keys?: () => IterableIterator<string> } }).cache
            if (cache?.keys) {
                return Array.from(cache.keys())
            }
        }
        return []
    }

    private actorFromInteraction(interaction: Interaction<CacheType>): DiscordActorAccess {
        return {
            userId: interaction.user.id,
            roleIds: this.interactionRoleIds(interaction),
            canManageGuild: interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true,
        }
    }

    private actorFromMessage(message: Message): DiscordActorAccess {
        return {
            userId: message.author.id,
            roleIds: message.member?.roles.cache.map((role) => role.id) || [],
            canManageGuild: message.member?.permissions.has(PermissionFlagsBits.ManageGuild) === true,
        }
    }

    private async authorizeInteraction(interaction: Interaction<CacheType>) {
        if (!interaction.guildId) {
            return false
        }
        const config = await readDiscordConfig()
        if (config.guildId && interaction.guildId !== config.guildId) {
            return false
        }
        return isDiscordActorAuthorized(config, this.actorFromInteraction(interaction))
    }

    private async authorizeMessage(message: Message) {
        const config = await readDiscordConfig()
        if (config.guildId && message.guildId !== config.guildId) {
            return false
        }
        return isDiscordActorAuthorized(config, this.actorFromMessage(message))
    }

    private async replyUnauthorized(interaction: Interaction<CacheType>) {
        const content = 'You are not authorized to use this Studio Discord integration. Ask a server manager or a configured Studio Discord admin role.'
        if ('replied' in interaction && 'deferred' in interaction && 'reply' in interaction && typeof interaction.reply === 'function') {
            const command = interaction as CommandInteraction
            if (command.replied || command.deferred) {
                await command.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
            } else {
                await command.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
            }
        }
    }

    private async replyInteractionFailure(interaction: Interaction<CacheType>, error: unknown) {
        const content = `Studio Discord sync failed: ${error instanceof Error ? error.message : String(error)}`
        if ('replied' in interaction && 'deferred' in interaction && 'reply' in interaction && typeof interaction.reply === 'function') {
            const command = interaction as CommandInteraction
            if (command.replied || command.deferred) {
                await command.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
            } else {
                await command.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
            }
        }
    }

    private async handleCommand(interaction: ChatInputCommandInteraction) {
        if (interaction.commandName === 'workspace') {
            await this.handleWorkspaceCommand(interaction)
            return
        }
        if (interaction.commandName === 'agent') {
            await this.handlePerformerCommand(interaction)
            return
        }
        if (interaction.commandName === 'team') {
            await this.handleActCommand(interaction)
            return
        }
    }

    private async handleAutocomplete(interaction: AutocompleteInteraction) {
        if (interaction.commandName !== 'team') {
            await interaction.respond([]).catch(() => {})
            return
        }
        const subcommand = interaction.options.getSubcommand(false)
        const focused = interaction.options.getFocused(true)
        if (subcommand !== 'message' || (focused.name !== 'agent' && focused.name !== 'participant')) {
            await interaction.respond([]).catch(() => {})
            return
        }
        const target = (await readDiscordMappings()).channels[interaction.channelId]
        if (!target || target.kind !== 'act-thread') {
            await interaction.respond([]).catch(() => {})
            return
        }
        const snapshot = await this.loadSnapshotForTarget(target).catch(() => null)
        const act = snapshot ? findWorkspaceAct(snapshot, target.actId) : null
        if (!act) {
            await interaction.respond([]).catch(() => {})
            return
        }
        const query = String(focused.value || '').trim().toLowerCase()
        const choices = Object.entries(act.participants || {})
            .map(([participantKey, binding]) => ({
                name: truncateDiscordText(binding.displayName || participantKey, 100),
                value: participantKey.slice(0, 100),
            }))
            .filter((choice) => {
                if (!query) return true
                return choice.name.toLowerCase().includes(query) || choice.value.toLowerCase().includes(query)
            })
            .slice(0, 25)
        await interaction.respond(choices).catch(() => {})
    }

    private async handleWorkspaceCommand(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand()
        if (subcommand === 'active') {
            await this.handleWorkspaceActiveCommand(interaction)
            return
        }
        if (subcommand === 'control') {
            await this.handleWorkspaceControlCommand(interaction)
            return
        }
        if (subcommand === 'sync') {
            await this.handleWorkspaceSyncCommand(interaction)
            return
        }
        if (subcommand === 'switch') {
            await this.handleWorkspaceSwitchCommand(interaction)
        }
    }

    private async handlePerformerCommand(interaction: ChatInputCommandInteraction) {
        if (interaction.options.getSubcommand() === 'new') {
            await this.handleNewPerformerThreadCommand(interaction)
        }
    }

    private async handleActCommand(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand()
        if (subcommand === 'participants') {
            await this.handleActParticipantsCommand(interaction)
            return
        }
        if (subcommand === 'message') {
            await this.handleActMessageCommand(interaction)
            return
        }
        if (subcommand === 'sync') {
            await this.handleActSyncCommand(interaction)
        }
    }

    private async handleWorkspaceActiveCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const mappings = await readDiscordMappings()
        const workspaceId = mappings.activeWorkspaceId
        if (!workspaceId) {
            await interaction.editReply('No active Studio workspace is synced yet.')
            return
        }
        const saved = await getSavedWorkspace(workspaceId)
        if (!saved.ok) {
            await interaction.editReply(`The active workspace mapping is stale: ${saved.error}`)
            return
        }
        const snapshot = workspaceSnapshotFromSaved(saved.workspace as SavedDiscordWorkspaceSnapshot)
        await interaction.editReply(`Active workspace: ${workspaceLabel(snapshot.workingDir)}\n${snapshot.workingDir}`)
    }

    private async handleWorkspaceControlCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const mappings = await readDiscordMappings()
        const target = mappings.channels[interaction.channelId]
        const workspaceId = target?.workspaceId || mappings.activeWorkspaceId
        if (!workspaceId) {
            await interaction.editReply('No active Studio workspace is synced yet.')
            return
        }
        await this.syncWorkspace(workspaceId)
        await interaction.editReply('Studio control refreshed.')
    }

    private async handleWorkspaceSyncCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const result = await this.syncAllWorkspaces()
        const failures = result.failedWorkspaces || []
        const failureSummary = failures.length > 0
            ? `\nFailed ${failures.length}: ${failures.slice(0, 3).map((failure) => `${failure.workingDir}: ${failure.error}`).join(' | ')}${failures.length > 3 ? ' | ...' : ''}`
            : ''
        await interaction.editReply(`Synced the active Studio workspace and refreshed the workspace selector.${failureSummary}`)
    }

    private async handleWorkspaceSwitchCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const input = interaction.options.getString('workspace', true).trim()
        const workspaces = await listSavedWorkspaces()
        const normalized = input.toLowerCase()
        const matches = workspaces.filter((workspace) => {
            const label = workspaceLabel(workspace.workingDir).toLowerCase()
            return workspace.id === input
                || workspace.workingDir === input
                || label === normalized
        })
        if (matches.length === 0) {
            await interaction.editReply('No saved Studio workspace matched that id, path, or folder name. Use the studio-control workspace selector for the safest switch path.')
            return
        }
        if (matches.length > 1) {
            await interaction.editReply(`Multiple saved Studio workspaces match "${input}". Use the exact saved workspace id instead.`)
            return
        }
        await this.syncWorkspace(matches[0].id)
        await interaction.editReply(`Active workspace switched to ${workspaceLabel(matches[0].workingDir)}.`)
    }

    private async handleNewPerformerThreadCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const channel = interaction.channel
        if (!channel?.isTextBased()) {
            await interaction.editReply('This command only works in Studio text channels.')
            return
        }
        const target = (await readDiscordMappings()).channels[interaction.channelId]
        if (!target || target.kind !== 'performer') {
            await interaction.editReply('New standalone agent threads can only be started from agent thread channels.')
            return
        }
        const snapshot = await this.loadSnapshotForTarget(target)
        const performer = findWorkspacePerformer(snapshot, target.performerId)
        if (!performer) {
            await interaction.editReply('That agent is no longer present in the saved Studio workspace.')
            return
        }
        const sessionId = await ensureStandaloneSession({
            workingDir: target.workingDir,
            performer,
        })
        const threadChannel = await this.ensurePerformerThreadChannel(target.workspaceId, snapshot, target.performerId, sessionId)
        await interaction.editReply(`Created ${threadChannel}.`)
    }

    private async handleActParticipantsCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const target = (await readDiscordMappings()).channels[interaction.channelId]
        if (!target || target.kind !== 'act-thread') {
            await interaction.editReply('Team agents are only available from Team thread channels.')
            return
        }
        const snapshot = await this.loadSnapshotForTarget(target)
        const act = findWorkspaceAct(snapshot, target.actId)
        if (!act) {
            await interaction.editReply('That Team is no longer present in the saved Studio workspace.')
            return
        }
        const lines = Object.keys(act.participants || {}).map((participantKey) => {
            const name = participantDisplayName(act, participantKey)
            return `- ${name}`
        })
        await interaction.editReply({
            content: lines.length
                ? `Agents for this Team thread:\n${lines.join('\n')}`
                : 'This Team has no agents.',
            allowedMentions: { parse: [] },
        })
    }

    private async handleActMessageCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        if (!(interaction.channel instanceof TextChannel)) {
            await interaction.editReply('Team messages can only be sent from Team thread text channels.')
            return
        }
        const target = (await readDiscordMappings()).channels[interaction.channelId]
        if (!target || target.kind !== 'act-thread') {
            await interaction.editReply('Team messages can only be sent from Team thread channels.')
            return
        }
        const participantKey = (interaction.options.getString('agent') || interaction.options.getString('participant') || '').trim()
        const content = interaction.options.getString('message', true).trim()
        if (!participantKey) {
            await interaction.editReply('Choose an agent before sending.')
            return
        }
        if (!content) {
            await interaction.editReply('Type a message before sending.')
            return
        }
        if (content.length > MAX_DISCORD_PROMPT_CHARS) {
            await interaction.editReply(`Discord Studio prompts are limited to ${MAX_DISCORD_PROMPT_CHARS} characters.`)
            return
        }
        const snapshot = await this.loadSnapshotForTarget(target)
        const act = findWorkspaceAct(snapshot, target.actId)
        if (!act) {
            await interaction.editReply('That Team is no longer present in the saved Studio workspace.')
            return
        }
        if (!act.participants?.[participantKey]) {
            const names = Object.keys(act.participants || {}).map((key) => participantDisplayName(act, key))
            await interaction.editReply({
                content: names.length
                    ? `That agent is not in this Team thread. Use the agent autocomplete for one of: ${names.join(', ')}.`
                    : 'This Team has no agents.',
                allowedMentions: { parse: [] },
            })
            return
        }
        const result = await this.sendActParticipantInput({
            channel: interaction.channel,
            target,
            participantKey,
            content,
        })
        await interaction.editReply(result)
    }

    private async handleActSyncCommand(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const channel = interaction.channel
        if (!(channel instanceof TextChannel)) {
            await interaction.editReply('Team sync only works in Team thread text channels.')
            return
        }
        const target = (await readDiscordMappings()).channels[interaction.channelId]
        if (!target || target.kind !== 'act-thread') {
            await interaction.editReply('Team sync only works from Team thread channels.')
            return
        }
        const snapshot = await this.loadSnapshotForTarget(target)
        const act = findWorkspaceAct(snapshot, target.actId)
        if (!act) {
            await interaction.editReply('That Team is no longer present in the saved Studio workspace.')
            return
        }
        const threads = await listActThreadsForDiscord(target.workingDir, target.actId)
        const thread = threads.threads.find((entry) => entry.id === target.threadId)
        if (!thread) {
            await interaction.editReply('That Team thread is no longer available.')
            return
        }
        const count = await this.syncActThreadParticipantHistory({
            channel,
            target,
            act,
            thread,
            limitPerParticipant: 20,
        })
        await this.refreshActThreadChannelName(channel, target)
        await interaction.editReply(count > 0
            ? `Synced ${count} recent agent message${count === 1 ? '' : 's'} into this Team thread.`
            : 'This Team thread is already up to date.')
    }

    private async handleSelect(interaction: StringSelectMenuInteraction) {
        const [prefix, kind, workspaceId] = interaction.customId.split(':')
        if (prefix !== 'apm' && prefix !== 'dot') {
            return
        }
        if (kind === 'q-select' && workspaceId) {
            await this.handleQuestionSelect(interaction, workspaceId)
            return
        }
        if (!workspaceId) {
            return
        }
        const value = interaction.values[0]
        if (!value) {
            await interaction.reply({ content: 'Nothing selected.', flags: MessageFlags.Ephemeral })
            return
        }
        if (kind === 'workspace') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
            await this.syncWorkspace(value)
            await interaction.editReply('Active Studio workspace switched.')
            return
        }
        const saved = await getSavedWorkspace(workspaceId)
        if (!saved.ok) {
            await interaction.reply({ content: saved.error, flags: MessageFlags.Ephemeral })
            return
        }
        const snapshot = workspaceSnapshotFromSaved(saved.workspace as SavedDiscordWorkspaceSnapshot)

        if (kind === 'performer') {
            const performer = findWorkspacePerformer(snapshot, value)
            if (!performer) {
                await interaction.reply({ content: 'Agent not found in the saved workspace.', flags: MessageFlags.Ephemeral })
                return
            }
            const threads = (await listStandaloneThreadsForDiscord(snapshot.workingDir, performer.id)).slice(0, 25)
            const components: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = []
            if (threads.length > 0) {
                components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`apm:performer-thread:${workspaceId}:${performer.id}`)
                        .setPlaceholder('Open saved agent thread')
                        .addOptions(threads.map((thread) => ({
                            label: thread.name.slice(0, 100),
                            value: thread.id,
                            description: thread.status || 'saved',
                        }))),
                ))
            }
            components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`apm:new-performer-thread:${workspaceId}:${performer.id}`)
                        .setLabel('New agent thread')
                    .setStyle(ButtonStyle.Primary),
            ))
            await interaction.reply({
                content: `Agent: **${performer.name}**`,
                components: components.slice(0, 5),
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
            })
            return
        }

        if (kind === 'performer-thread') {
            const [, , selectedWorkspaceId, performerId] = interaction.customId.split(':')
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
            const channel = await this.ensurePerformerThreadChannel(selectedWorkspaceId, snapshot, performerId, value)
            await interaction.editReply(`Opened ${channel}.`)
            return
        }

        if (kind === 'act') {
            const act = findWorkspaceAct(snapshot, value)
            if (!act) {
                await interaction.reply({ content: 'Team not found in the saved workspace.', flags: MessageFlags.Ephemeral })
                return
            }
            const threads = (await listActThreadsForDiscord(snapshot.workingDir, act.id)).threads.slice(0, 25)
            const components: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = []
            if (threads.length > 0) {
                components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`apm:act-thread:${workspaceId}:${act.id}`)
                        .setPlaceholder('Open saved Team thread')
                        .addOptions(threads.map((thread) => ({
                            label: (thread.name || unnamedThreadNameFor(threads, thread.id)).slice(0, 100),
                            value: thread.id,
                            description: thread.status,
                        }))),
                ))
            }
            components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`apm:new-act-thread:${workspaceId}:${act.id}`)
                    .setLabel('New Team thread')
                    .setStyle(ButtonStyle.Primary),
            ))
            await interaction.reply({
                content: `Team: **${act.name}**`,
                components: components.slice(0, 5),
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
            })
            return
        }

        if (kind === 'act-thread') {
            const [, , selectedWorkspaceId, actId] = interaction.customId.split(':')
            const act = findWorkspaceAct(snapshot, actId)
            if (!act) {
                await interaction.reply({ content: 'Team not found in the saved workspace.', flags: MessageFlags.Ephemeral })
                return
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
            const channel = await this.ensureActThreadChannel(selectedWorkspaceId, snapshot, act, value)
            await interaction.editReply(`Opened ${channel}.`)
        }
    }

    private async handleButton(interaction: ButtonInteraction) {
        const [prefix, kind, workspaceId, entityId] = interaction.customId.split(':')
        if (prefix !== 'apm' && prefix !== 'dot') {
            return
        }
        if (kind === 'perm') {
            await this.handlePermissionButton(interaction)
            return
        }
        if (kind === 'q-answer') {
            await this.handleQuestionAnswerButton(interaction)
            return
        }
        if (kind === 'q-custom') {
            await this.handleQuestionCustomButton(interaction)
            return
        }
        if (kind === 'q-reject') {
            await this.handleQuestionRejectButton(interaction)
            return
        }
        if (kind === 'sync' && workspaceId) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
            await this.syncWorkspace(workspaceId)
            await interaction.editReply('Workspace synced.')
            return
        }
        if (kind === 'new-performer-thread' && workspaceId && entityId) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
            const saved = await getSavedWorkspace(workspaceId)
            if (!saved.ok) {
                await interaction.editReply(saved.error)
                return
            }
            const snapshot = workspaceSnapshotFromSaved(saved.workspace as SavedDiscordWorkspaceSnapshot)
            const performer = findWorkspacePerformer(snapshot, entityId)
            if (!performer) {
                await interaction.editReply('Agent not found in the saved workspace.')
                return
            }
            const sessionId = await ensureStandaloneSession({
                workingDir: snapshot.workingDir,
                performer,
            })
            const channel = await this.ensurePerformerThreadChannel(workspaceId, snapshot, performer.id, sessionId)
            await interaction.editReply(`Created ${channel}.`)
            return
        }
        if (kind === 'new-act-thread' && workspaceId && entityId) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
            const saved = await getSavedWorkspace(workspaceId)
            if (!saved.ok) {
                await interaction.editReply(saved.error)
                return
            }
            const snapshot = workspaceSnapshotFromSaved(saved.workspace as SavedDiscordWorkspaceSnapshot)
            const act = findWorkspaceAct(snapshot, entityId)
            if (!act) {
                await interaction.editReply('Team not found in the saved workspace.')
                return
            }
            const result = await createActThreadForDiscord(snapshot.workingDir, act, snapshot)
            const channel = await this.ensureActThreadChannel(workspaceId, snapshot, act, result.thread.id)
            await interaction.editReply(`Created ${channel}.`)
        }
    }

    private async showQuestionAnswerModal(interaction: ButtonInteraction, pendingId: string) {
        const pending = await this.requirePendingInteraction(pendingId, interaction)
        if (pending.kind !== 'question') {
            await interaction.reply({ content: 'That prompt is not a question.', flags: MessageFlags.Ephemeral })
            return
        }
        const request = pending.request as unknown as QuestionRequest
        const questions = (request.questions || []).slice(0, 5)
        if (questions.length === 0) {
            await interaction.reply({ content: 'That question request has no questions to answer.', flags: MessageFlags.Ephemeral })
            return
        }

        const modal = new ModalBuilder()
            .setCustomId(`apm:q-submit:${pendingId}`)
            .setTitle('Answer Studio Question')
        questions.forEach((question, index) => {
            const placeholderParts = [
                question.options?.length ? `Options: ${question.options.slice(0, 5).map((option) => option.label).join(', ')}` : '',
                question.multiple ? 'Multiple answers: separate with commas.' : '',
            ].filter(Boolean)
            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId(`answer_${index}`)
                        .setLabel(truncateDiscordText(question.header || `Question ${index + 1}`, 45))
                        .setPlaceholder(truncateDiscordText(placeholderParts.join(' '), 100) || 'Type your answer')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true),
                ),
            )
        })
        await interaction.showModal(modal)
    }

    private async submitQuestionAnswers(
        interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
        pendingId: string,
        answers: QuestionAnswer[],
    ) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const pending = await this.requirePendingInteraction(pendingId, interaction)
        if (pending.kind !== 'question') {
            await interaction.editReply('That prompt is not a question.')
            return
        }
        const request = pending.request as unknown as QuestionRequest
        const questionId = typeof request.id === 'string' ? request.id : ''
        if (!questionId) {
            await interaction.editReply('That question request is missing its id.')
            return
        }
        const afterMessageId = await getLatestDiscordAssistantMessageId(pending.workingDir, pending.sessionId).catch(() => null)
        await respondDiscordQuestion(pending.workingDir, questionId, answers)
        await this.clearPendingInteraction(pendingId)
        await interaction.editReply('Answer submitted.')
        if (interaction.channel?.isTextBased() && interaction.channel instanceof TextChannel) {
            const stopTyping = this.startTypingIndicator(interaction.channel)
            try {
                const reply = await waitForAssistantReply(pending.workingDir, pending.sessionId, {
                    afterMessageId,
                    ignorePendingRequestId: questionId,
                })
                await this.postPendingContinuation(interaction.channel, pending, pending.sessionId, reply)
            } finally {
                stopTyping()
            }
        }
    }

    private async requirePendingInteraction(id: string, interaction: Interaction<CacheType>) {
        const mappings = await readDiscordMappings()
        const pending = mappings.pendingInteractions?.[id]
        if (!pending) {
            throw new Error('That Studio prompt is no longer pending.')
        }
        if (pending.channelId !== interaction.channelId) {
            throw new Error('That Studio prompt belongs to another Discord channel.')
        }
        return pending
    }

    private async handlePermissionButton(interaction: ButtonInteraction) {
        const [, , pendingId, response] = interaction.customId.split(':') as Array<string>
        if (response !== 'once' && response !== 'always' && response !== 'reject') {
            await interaction.reply({ content: 'Unknown permission response.', flags: MessageFlags.Ephemeral })
            return
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const pending = await this.requirePendingInteraction(pendingId, interaction)
        if (pending.kind !== 'permission') {
            await interaction.editReply('That prompt is not a permission request.')
            return
        }
        const permissionId = typeof pending.request.id === 'string' ? pending.request.id : ''
        if (!permissionId) {
            await interaction.editReply('That permission request is missing its id.')
            return
        }
        const afterMessageId = await getLatestDiscordAssistantMessageId(pending.workingDir, pending.sessionId).catch(() => null)
        await respondDiscordPermission({
            workingDir: pending.workingDir,
            sessionId: pending.sessionId,
            permissionId,
            response,
        })
        await this.clearPendingInteraction(pendingId)
        await interaction.editReply(response === 'reject' ? 'Permission denied.' : `Permission allowed ${response === 'always' ? 'always' : 'once'}.`)
        if (response !== 'reject' && interaction.channel?.isTextBased() && interaction.channel instanceof TextChannel) {
            const stopTyping = this.startTypingIndicator(interaction.channel)
            try {
                const reply = await waitForAssistantReply(pending.workingDir, pending.sessionId, {
                    afterMessageId,
                    ignorePendingRequestId: permissionId,
                })
                await this.postPendingContinuation(interaction.channel, pending, pending.sessionId, reply)
            } finally {
                stopTyping()
            }
        }
    }

    private async postPendingContinuation(
        channel: TextChannel,
        pending: { workspaceId: string; workingDir: string; channelId: string },
        sessionId: string,
        reply: DiscordAssistantReply,
    ) {
        const target = (await readDiscordMappings()).channels[pending.channelId]
        if (reply.kind === 'message' && target?.kind === 'act-thread') {
            const snapshot = await this.loadSnapshotForTarget(target)
            const act = findWorkspaceAct(snapshot, target.actId)
            if (!act) {
                await this.postAssistantReplyToChannel(channel, pending, sessionId, reply)
                return
            }
            const threads = await listActThreadsForDiscord(target.workingDir, target.actId).catch(() => ({ threads: [] }))
            const thread = threads.threads.find((entry) => entry.id === target.threadId)
            if (!thread) {
                await this.postAssistantReplyToChannel(channel, pending, sessionId, reply)
                return
            }
            void this.syncActThreadUntilIdle({
                channel,
                target,
                act,
                thread,
                limitPerParticipant: 20,
            }).catch((error) => {
                console.error('[discord] Team thread sync after pending continuation failed:', error)
            })
            return
        }
        await this.postAssistantReplyToChannel(channel, pending, sessionId, reply)
    }

    private async handleQuestionAnswerButton(interaction: ButtonInteraction) {
        const [, , pendingId] = interaction.customId.split(':')
        const pending = await this.requirePendingInteraction(pendingId, interaction)
        if (pending.kind !== 'question') {
            await interaction.reply({ content: 'That prompt is not a question.', flags: MessageFlags.Ephemeral })
            return
        }
        const request = pending.request as unknown as QuestionRequest
        const questions = (request.questions || []).slice(0, 5)
        if (questions.length === 0) {
            await interaction.reply({ content: 'That question request has no questions to answer.', flags: MessageFlags.Ephemeral })
            return
        }

        const question = questions[0]
        const options = (question.options || []).slice(0, 25)
        if (questions.length === 1 && options.length > 0) {
            const rows: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`apm:q-select:${pendingId}`)
                        .setPlaceholder(question.multiple ? 'Choose one or more options' : 'Choose an option')
                        .setMinValues(1)
                        .setMaxValues(question.multiple ? options.length : 1)
                        .addOptions(options.map((option, index) => ({
                            label: truncateDiscordText(option.label || `Option ${index + 1}`, 100),
                            value: String(index),
                            ...(option.description ? { description: truncateDiscordText(option.description, 100) } : {}),
                        }))),
                ),
            ]
            const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`apm:q-reject:${pendingId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            )
            if (question.custom !== false) {
                buttons.addComponents(
                    new ButtonBuilder().setCustomId(`apm:q-custom:${pendingId}`).setLabel('Other').setStyle(ButtonStyle.Primary),
                )
            }
            rows.push(buttons)
            await interaction.reply({
                content: formatQuestionPrompt(request),
                components: rows.slice(0, 5),
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
            })
            return
        }

        await this.showQuestionAnswerModal(interaction, pendingId)
    }

    private async handleQuestionCustomButton(interaction: ButtonInteraction) {
        const [, , pendingId] = interaction.customId.split(':')
        await this.showQuestionAnswerModal(interaction, pendingId)
    }

    private async handleQuestionSelect(interaction: StringSelectMenuInteraction, pendingId: string) {
        const pending = await this.requirePendingInteraction(pendingId, interaction)
        if (pending.kind !== 'question') {
            await interaction.reply({ content: 'That prompt is not a question.', flags: MessageFlags.Ephemeral })
            return
        }
        const request = pending.request as unknown as QuestionRequest
        const question = request.questions?.[0]
        if (!question?.options?.length) {
            await interaction.reply({ content: 'That question no longer has selectable options.', flags: MessageFlags.Ephemeral })
            return
        }
        const selected = interaction.values
            .map((value) => {
                const index = Number(value)
                return Number.isInteger(index) ? question.options?.[index]?.label : null
            })
            .filter((value): value is string => !!value)
        if (selected.length === 0) {
            await interaction.reply({ content: 'Choose at least one option, or use Other.', flags: MessageFlags.Ephemeral })
            return
        }
        await this.submitQuestionAnswers(interaction, pendingId, [selected])
    }

    private async handleQuestionRejectButton(interaction: ButtonInteraction) {
        const [, , pendingId] = interaction.customId.split(':')
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const pending = await this.requirePendingInteraction(pendingId, interaction)
        if (pending.kind !== 'question') {
            await interaction.editReply('That prompt is not a question.')
            return
        }
        const questionId = typeof pending.request.id === 'string' ? pending.request.id : ''
        if (!questionId) {
            await interaction.editReply('That question request is missing its id.')
            return
        }
        await rejectDiscordQuestion(pending.workingDir, questionId)
        await this.clearPendingInteraction(pendingId)
        await interaction.editReply('Question cancelled.')
    }

    private async handleModalSubmit(interaction: ModalSubmitInteraction) {
        const [prefix, kind, pendingId] = interaction.customId.split(':')
        if (prefix !== 'apm' && prefix !== 'dot') {
            return
        }
        if (kind !== 'q-submit' || !pendingId) {
            return
        }
        const pending = await this.requirePendingInteraction(pendingId, interaction)
        if (pending.kind !== 'question') {
            await interaction.reply({ content: 'That prompt is not a question.', flags: MessageFlags.Ephemeral })
            return
        }
        const request = pending.request as unknown as QuestionRequest
        const answers: QuestionAnswer[] = (request.questions || []).slice(0, 5).map((question, index) => {
            const raw = interaction.fields.getTextInputValue(`answer_${index}`).trim()
            if (question.multiple) {
                return raw.split(',').map((value) => value.trim()).filter(Boolean)
            }
            return raw ? [raw] : []
        })
        await this.submitQuestionAnswers(interaction, pendingId, answers)
    }

    private async ensurePerformerThreadChannel(workspaceId: string, snapshot: DiscordWorkspaceSnapshot, performerId: string, sessionId: string) {
        const config = await readDiscordConfig()
        const guild = await this.requireGuild(config)
        const performer = findWorkspacePerformer(snapshot, performerId)
        if (!performer) {
            throw new Error('Agent not found in the saved workspace.')
        }
        const mappings = await readDiscordMappings()
        const workspaceMapping = getOrCreateWorkspaceMapping(mappings, workspaceId, snapshot.workingDir)
        workspaceMapping.performerCategories ||= {}
        workspaceMapping.performerThreadChannels ||= {}
        const category = await this.ensureCategory(
            guild,
            workspaceMapping.performerCategories[performerId],
            performerCategoryName(performer.name),
        )
        const categoryId = category.id
        workspaceMapping.performerCategories[performerId] = categoryId
        mappings.activeWorkspaceId = workspaceId
        const threads = await listStandaloneThreadsForDiscord(snapshot.workingDir, performerId)
        const thread = threads.find((entry) => entry.id === sessionId)
        const mappingKey = performerThreadMappingKey(performerId, sessionId)
        const channel = await this.ensureTextChannel(
            guild,
            workspaceMapping.performerThreadChannels[mappingKey],
            threadChannelName(thread?.name, sessionId),
            categoryId,
            `APM Studio agent thread: ${performer.name}`,
        )
        workspaceMapping.performerThreadChannels[mappingKey] = channel.id
        mappings.channels[channel.id] = {
            kind: 'performer',
            workspaceId,
            workingDir: snapshot.workingDir,
            performerId,
            sessionId,
        }
        await updateDiscordMappings(() => mappings)
        await this.backfillSessionHistory({
            channel,
            workspaceId,
            workingDir: snapshot.workingDir,
            sessionId,
            assistantLabel: performer.name,
        })
        return channel
    }

    private async ensureActThreadChannel(workspaceId: string, snapshot: DiscordWorkspaceSnapshot, act: DiscordActSnapshot, threadId: string) {
        const config = await readDiscordConfig()
        const guild = await this.requireGuild(config)
        const mappings = await readDiscordMappings()
        const workspaceMapping = getOrCreateWorkspaceMapping(mappings, workspaceId, snapshot.workingDir)
        workspaceMapping.actCategories ||= {}
        const category = await this.ensureCategory(
            guild,
            workspaceMapping.actCategories[act.id],
            actCategoryName(act.name),
        )
        const categoryId = category.id
        workspaceMapping.actCategories[act.id] = categoryId
        mappings.activeWorkspaceId = workspaceId
        const threads = await listActThreadsForDiscord(snapshot.workingDir, act.id)
        const thread = threads.threads.find((entry) => entry.id === threadId)
        const threadName = thread?.name?.trim() || unnamedThreadNameFor(threads.threads, threadId)
        const channel = await this.ensureTextChannel(
            guild,
            workspaceMapping.actThreadChannels[actThreadMappingKey(act.id, threadId)],
            threadChannelName(threadName, threadId),
            categoryId,
            `APM Studio Team thread: ${act.name}`,
        )
        workspaceMapping.actThreadChannels[actThreadMappingKey(act.id, threadId)] = channel.id
        const existingTarget = mappings.channels[channel.id]
        mappings.channels[channel.id] = {
            kind: 'act-thread',
            workspaceId,
            workingDir: snapshot.workingDir,
            actId: act.id,
            threadId,
            sessionIds: existingTarget?.kind === 'act-thread'
                ? existingTarget.sessionIds
                : {},
        }
        await updateDiscordMappings(() => mappings)
        if (thread?.participantSessions) {
            let remaining = 20
            for (const [participantKey, sessionId] of Object.entries(thread.participantSessions)) {
                if (!sessionId || remaining <= 0) continue
                const count = await this.backfillSessionHistory({
                    channel,
                    workspaceId,
                    workingDir: snapshot.workingDir,
                    sessionId,
                    assistantLabel: participantDisplayName(act, participantKey),
                    limit: remaining,
                    includeUserMessages: false,
                })
                remaining -= count
            }
            void this.syncActThreadUntilIdle({
                channel,
                target: mappings.channels[channel.id] as Extract<DiscordChannelTarget, { kind: 'act-thread' }>,
                act,
                thread,
                limitPerParticipant: 20,
            }).catch((error) => {
                console.error('[discord] Team thread sync after channel open failed:', error)
            })
        }
        return channel
    }

    private async refreshPerformerThreadChannelName(
        channel: TextChannel,
        target: Extract<DiscordChannelTarget, { kind: 'performer' }>,
        sessionId: string,
    ) {
        const threads = await listStandaloneThreadsForDiscord(target.workingDir, target.performerId).catch(() => [])
        const thread = threads.find((entry) => entry.id === sessionId)
        const nextName = threadChannelName(thread?.name, sessionId)
        if (nextName && channel.name !== nextName) {
            await channel.setName(nextName).catch(() => {})
        }
    }

    private async refreshActThreadChannelName(
        channel: TextChannel,
        target: Extract<DiscordChannelTarget, { kind: 'act-thread' }>,
    ) {
        const threads = await listActThreadsForDiscord(target.workingDir, target.actId).catch(() => ({ threads: [] }))
        const thread = threads.threads.find((entry) => entry.id === target.threadId)
        const threadName = thread?.name?.trim() || unnamedThreadNameFor(threads.threads, target.threadId)
        const nextName = threadChannelName(threadName, target.threadId)
        if (nextName && channel.name !== nextName) {
            await channel.setName(nextName).catch(() => {})
        }
    }

    private scheduleThreadChannelNameRefresh(
        channel: TextChannel,
        target: Extract<DiscordChannelTarget, { kind: 'performer' | 'act-thread' }>,
        sessionId?: string,
    ) {
        setTimeout(() => {
            if (target.kind === 'performer' && sessionId) {
                void this.refreshPerformerThreadChannelName(channel, target, sessionId)
                return
            }
            if (target.kind === 'act-thread') {
                void this.refreshActThreadChannelName(channel, target)
            }
        }, 12_000).unref?.()
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

    private async hasPendingInteractionPrompt(params: {
        channelId: string
        sessionId: string
        reply: DiscordAssistantReply
    }) {
        if (params.reply.kind === 'message') {
            return false
        }
        const requestId = typeof params.reply.request.id === 'string' ? params.reply.request.id : ''
        if (!requestId) {
            return false
        }
        const mappings = await readDiscordMappings()
        return Object.values(mappings.pendingInteractions || {}).some((pending) => {
            const pendingRequestId = typeof pending.request.id === 'string' ? pending.request.id : ''
            const createdAt = typeof pending.createdAt === 'number' ? pending.createdAt : 0
            return pending.channelId === params.channelId
                && pending.sessionId === params.sessionId
                && pending.kind === params.reply.kind
                && pendingRequestId === requestId
                && Date.now() - createdAt <= PENDING_INTERACTION_TTL_MS
        })
    }

    private async postPendingInteractionIfMissing(params: {
        channel: TextChannel
        workspaceId: string
        workingDir: string
        sessionId: string
    }) {
        const reply = await findPendingStudioInteraction(params.workingDir, params.sessionId).catch(() => null)
        if (!reply || reply.kind === 'message') {
            return false
        }
        if (await this.hasPendingInteractionPrompt({
            channelId: params.channel.id,
            sessionId: params.sessionId,
            reply,
        })) {
            return false
        }
        await this.postAssistantReplyToChannel(params.channel, {
            workspaceId: params.workspaceId,
            workingDir: params.workingDir,
            channelId: params.channel.id,
        }, params.sessionId, reply)
        return true
    }

    private beginDiscordSessionTurn(sessionId: string) {
        if (this.activeDiscordSessionTurns.has(sessionId)) {
            return false
        }
        this.activeDiscordSessionTurns.add(sessionId)
        return true
    }

    private endDiscordSessionTurn(sessionId: string) {
        this.activeDiscordSessionTurns.delete(sessionId)
    }

    private async replyIfSessionBlocked(message: Message, workingDir: string, sessionId: string) {
        if (this.activeDiscordSessionTurns.has(sessionId)) {
            await message.reply({
                content: 'This Studio thread is already handling a Discord message. Wait for the current reply to finish before sending another one.',
                allowedMentions: { parse: [] },
            })
            return true
        }
        const block = await describeDiscordSessionBlock(workingDir, sessionId)
        if (block.blocked) {
            if ((block.reason === 'permission' || block.reason === 'question') && message.channel instanceof TextChannel) {
                const target = (await readDiscordMappings()).channels[message.channelId]
                if (target?.workspaceId && await this.postPendingInteractionIfMissing({
                    channel: message.channel,
                    workspaceId: target.workspaceId,
                    workingDir,
                    sessionId,
                })) {
                    return true
                }
            }
            await message.reply({
                content: block.message || 'This Studio thread is not ready for another message yet.',
                allowedMentions: { parse: [] },
            })
            return true
        }
        return false
    }

    private async isActThreadRunning(
        target: Extract<DiscordChannelTarget, { kind: 'act-thread' }>,
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
            if (!options.ignoreDiscordTurnLocks && !options.ignoreActiveTurnSessionIds?.has(sessionId) && this.activeDiscordSessionTurns.has(sessionId)) {
                return true
            }
            if (await isDiscordSessionRunning(target.workingDir, sessionId)) {
                return true
            }
        }
        return false
    }

    private async syncActThreadParticipantHistory(params: {
        channel: TextChannel
        target: Extract<DiscordChannelTarget, { kind: 'act-thread' }>
        act: DiscordActSnapshot
        thread: { participantSessions?: Record<string, string> }
        limitPerParticipant?: number
        ignoreActiveTurnSessionIds?: string[]
    }) {
        let total = 0
        const sessionEntries = {
            ...(params.thread.participantSessions || {}),
            ...(params.target.sessionIds || {}),
        }
        for (const [participantKey, sessionId] of Object.entries(sessionEntries)) {
            if (!sessionId) continue
            total += await this.backfillSessionHistory({
                channel: params.channel,
                workspaceId: params.target.workspaceId,
                workingDir: params.target.workingDir,
                sessionId,
                assistantLabel: participantDisplayName(params.act, participantKey),
                limit: params.limitPerParticipant || 20,
                announce: false,
                includeUserMessages: false,
            })
        }
        return total
    }

    private async syncActThreadUntilIdle(params: {
        channel: TextChannel
        target: Extract<DiscordChannelTarget, { kind: 'act-thread' }>
        act: DiscordActSnapshot
        thread: { participantSessions?: Record<string, string> }
        limitPerParticipant?: number
        ignoreActiveTurnSessionIds?: string[]
    }) {
        const key = `${params.channel.id}:${params.target.workspaceId}:${params.target.actId}:${params.target.threadId}`
        const active = this.activeActThreadSyncs.get(key)
        if (active) {
            active.expiresAt = Date.now() + ACT_THREAD_SYNC_TIMEOUT_MS
            return active.promise
        }
        const run = this.runActThreadSyncUntilIdle(params)
            .finally(() => {
                if (this.activeActThreadSyncs.get(key)?.promise === run) {
                    this.activeActThreadSyncs.delete(key)
                }
            })
        this.activeActThreadSyncs.set(key, {
            promise: run,
            expiresAt: Date.now() + ACT_THREAD_SYNC_TIMEOUT_MS,
        })
        return run
    }

    private async runActThreadSyncUntilIdle(params: {
        channel: TextChannel
        target: Extract<DiscordChannelTarget, { kind: 'act-thread' }>
        act: DiscordActSnapshot
        thread: { participantSessions?: Record<string, string> }
        limitPerParticipant?: number
        ignoreActiveTurnSessionIds?: string[]
    }) {
        const key = `${params.channel.id}:${params.target.workspaceId}:${params.target.actId}:${params.target.threadId}`
        let total = 0
        let idleConfirmations = 0
        let thread = params.thread
        while (Date.now() < (this.activeActThreadSyncs.get(key)?.expiresAt || 0)) {
            const latestThreads = await listActThreadsForDiscord(params.target.workingDir, params.target.actId).catch(() => ({ threads: [] }))
            thread = latestThreads.threads.find((entry) => entry.id === params.target.threadId) || thread

            const synced = await this.syncActThreadParticipantHistory({
                channel: params.channel,
                target: params.target,
                act: params.act,
                thread,
                limitPerParticipant: params.limitPerParticipant || 20,
            })
            total += synced
            await this.refreshActThreadChannelName(params.channel, params.target)

            const running = await this.isActThreadRunning(params.target, thread, {
                ignoreActiveTurnSessionIds: new Set(params.ignoreActiveTurnSessionIds || []),
                ignoreDiscordTurnLocks: true,
            })
            if (running) {
                idleConfirmations = 0
                await params.channel.sendTyping().catch(() => {})
            } else if (synced > 0) {
                idleConfirmations = 0
                const active = this.activeActThreadSyncs.get(key)
                if (active) {
                    active.expiresAt = Date.now() + ACT_THREAD_SYNC_TIMEOUT_MS
                }
            } else {
                idleConfirmations += 1
                if (idleConfirmations >= ACT_THREAD_IDLE_CONFIRMATIONS) {
                    break
                }
            }

            await sleep(ACT_THREAD_SYNC_POLL_MS)
        }

        await sleep(1_000)
        const latestThreads = await listActThreadsForDiscord(params.target.workingDir, params.target.actId).catch(() => ({ threads: [] }))
        thread = latestThreads.threads.find((entry) => entry.id === params.target.threadId) || thread
        total += await this.syncActThreadParticipantHistory({
            channel: params.channel,
            target: params.target,
            act: params.act,
            thread,
            limitPerParticipant: params.limitPerParticipant || 20,
        })
        await this.refreshActThreadChannelName(params.channel, params.target)
        return total
    }

    private async handleMessage(message: Message) {
        if (message.author.bot || !message.guildId) {
            return
        }
        if (!(await this.authorizeMessage(message))) {
            await message.reply({
                content: 'You are not authorized to use this Studio Discord integration.',
                allowedMentions: { parse: [] },
            }).catch(() => {})
            return
        }
        const mappings = await readDiscordMappings()
        const target = mappings.channels[message.channelId]
        if (!target || target.kind === 'menu') {
            return
        }
        const content = message.content.trim()
        if (!content) {
            this.messageContentLikelyMissing = true
            await message.reply({
                content: 'I received the message event, but Discord did not include message content. Enable the Message Content privileged intent for this bot.',
                allowedMentions: { parse: [] },
            })
            return
        }
        if (content.length > MAX_DISCORD_PROMPT_CHARS) {
            await message.reply({
                content: `Discord Studio prompts are limited to ${MAX_DISCORD_PROMPT_CHARS} characters.`,
                allowedMentions: { parse: [] },
            })
            return
        }

        if (target.kind === 'performer') {
            await this.handlePerformerMessage(message, target, content)
            return
        }
        await this.handleActThreadMessage(message)
    }

    private async loadSnapshotForTarget(target: DiscordChannelTarget) {
        const saved = Object.entries((await readDiscordMappings()).workspaces)
            .find(([workspaceId]) => workspaceId === target.workspaceId)
        if (!saved) {
            throw new Error('Workspace mapping not found.')
        }
        const workspace = await getSavedWorkspace(target.workspaceId)
        if (!workspace.ok) {
            throw new Error(workspace.error)
        }
        return workspaceSnapshotFromSaved(workspace.workspace as SavedDiscordWorkspaceSnapshot)
    }

    private async handlePerformerMessage(message: Message, target: Extract<DiscordChannelTarget, { kind: 'performer' }>, content: string) {
        const snapshot = await this.loadSnapshotForTarget(target)
        const performer = findWorkspacePerformer(snapshot, target.performerId)
        if (!performer) {
            await message.reply({ content: 'That agent is no longer present in the saved Studio workspace.', allowedMentions: { parse: [] } })
            return
        }
        if (!performer.model) {
            await message.reply({ content: `Configure a model for "${performer.name}" in APM Studio before chatting from Discord.`, allowedMentions: { parse: [] } })
            return
        }

        const sessionId = await ensureStandaloneSession({
            workingDir: target.workingDir,
            performer,
            sessionId: target.sessionId,
        })
        if (await this.replyIfSessionBlocked(message, target.workingDir, sessionId)) {
            return
        }
        if (!this.beginDiscordSessionTurn(sessionId)) {
            await this.replyIfSessionBlocked(message, target.workingDir, sessionId)
            return
        }
        const stopTyping = this.startTypingIndicator(message.channel instanceof TextChannel ? message.channel : null)
        try {
            const afterMessageId = await getLatestDiscordAssistantMessageId(target.workingDir, sessionId).catch(() => null)
            await updateDiscordMappings((mappings) => {
                const current = mappings.channels[message.channelId]
                if (current?.kind === 'performer') {
                    current.sessionId = sessionId
                }
            })
            await sendPerformerDiscordMessage({
                workingDir: target.workingDir,
                sessionId,
                performer,
                message: content,
            })
            if (message.channel instanceof TextChannel) {
                await this.refreshPerformerThreadChannelName(message.channel, target, sessionId)
                this.scheduleThreadChannelNameRefresh(message.channel, target, sessionId)
            }
            const reply = await waitForAssistantReply(target.workingDir, sessionId, { afterMessageId })
            await this.postAssistantReply(message, target, sessionId, reply)
            if (message.channel instanceof TextChannel) {
                await this.refreshPerformerThreadChannelName(message.channel, target, sessionId)
            }
        } finally {
            stopTyping()
            this.endDiscordSessionTurn(sessionId)
        }
    }

    private async handleActThreadMessage(message: Message) {
        await message.reply({
            content: 'Use `/team message` in this Team thread to choose an agent and send a message. Direct Team chat messages are not routed.',
            allowedMentions: { parse: [] },
        })
    }

    private async sendActParticipantInput(params: {
        channel: TextChannel
        target: Extract<DiscordChannelTarget, { kind: 'act-thread' }>
        participantKey: string
        content: string
    }) {
        const snapshot = await this.loadSnapshotForTarget(params.target)
        const act = findWorkspaceAct(snapshot, params.target.actId)
        if (!act) {
            return 'That Team is no longer present in the saved Studio workspace.'
        }
        const threads = await listActThreadsForDiscord(params.target.workingDir, params.target.actId)
        const thread = threads.threads.find((entry) => entry.id === params.target.threadId)
        if (!thread) {
            return 'That Team thread is no longer available.'
        }
        for (const [runningParticipantKey, runningSessionId] of Object.entries(thread.participantSessions || {})) {
            if (!runningSessionId) continue
            if (this.activeDiscordSessionTurns.has(runningSessionId)) {
                return `This Team thread is already handling a Discord message for ${participantDisplayName(act, runningParticipantKey)}. Wait for the current turn to finish before sending another message.`
            }
            const block = await describeDiscordSessionBlock(params.target.workingDir, runningSessionId)
            if (block.blocked) {
                const detail = block.reason === 'permission'
                    ? 'waiting for a permission response'
                    : block.reason === 'question'
                        ? 'waiting for a question response'
                        : 'still running'
                const reposted = (block.reason === 'permission' || block.reason === 'question')
                    ? await this.postPendingInteractionIfMissing({
                        channel: params.channel,
                        workspaceId: params.target.workspaceId,
                        workingDir: params.target.workingDir,
                        sessionId: runningSessionId,
                    })
                    : false
                return `This Team thread cannot accept new Discord messages because ${participantDisplayName(act, runningParticipantKey)} is ${detail}.${reposted ? ' I reposted the pending Studio prompt in this channel.' : ''}`
            }
        }

        const performer = resolveActParticipantPerformer(snapshot, act, params.participantKey)
        if (!performer) {
            return `Cannot resolve agent for "${participantDisplayName(act, params.participantKey)}".`
        }
        if (!performer.model) {
            return `Configure a model for "${performer.name}" in APM Studio before chatting from Discord.`
        }

        const sessionId = await ensureActParticipantSession({
            workingDir: params.target.workingDir,
            actId: params.target.actId,
            thread,
            participantKey: params.participantKey,
            performer,
        })
        const sessionBlock = await describeDiscordSessionBlock(params.target.workingDir, sessionId)
        if (sessionBlock.blocked) {
            const reposted = (sessionBlock.reason === 'permission' || sessionBlock.reason === 'question')
                ? await this.postPendingInteractionIfMissing({
                    channel: params.channel,
                    workspaceId: params.target.workspaceId,
                    workingDir: params.target.workingDir,
                    sessionId,
                })
                : false
            const message = sessionBlock.message || 'This Studio thread is not ready for another message yet.'
            return reposted ? `${message} I reposted the pending Studio prompt in this channel.` : message
        }
        if (!this.beginDiscordSessionTurn(sessionId)) {
            return 'This Studio thread is already handling a Discord message. Wait for the current reply to finish before sending another one.'
        }
        const stopTyping = this.startTypingIndicator(params.channel)
        try {
            const afterMessageId = await getLatestDiscordAssistantMessageId(params.target.workingDir, sessionId).catch(() => null)
            await updateDiscordMappings((mappings) => {
                const current = mappings.channels[params.channel.id]
                if (current?.kind === 'act-thread') {
                    current.sessionIds ||= {}
                    current.sessionIds[params.participantKey] = sessionId
                }
            })
            params.target.sessionIds = {
                ...(params.target.sessionIds || {}),
                [params.participantKey]: sessionId,
            }
            await params.channel.send({
                content: `**[APM User -> ${participantDisplayName(act, params.participantKey)}]**\n${params.content}`,
                allowedMentions: { parse: [] },
            })
            await sendActParticipantDiscordMessage({
                workingDir: params.target.workingDir,
                sessionId,
                actId: params.target.actId,
                threadId: params.target.threadId,
                participantKey: params.participantKey,
                performer,
                message: params.content,
            })
            const latestThreadsAfterSend = await listActThreadsForDiscord(params.target.workingDir, params.target.actId).catch(() => threads)
            const latestThreadAfterSend = latestThreadsAfterSend.threads.find((entry) => entry.id === params.target.threadId) || {
                ...thread,
                participantSessions: {
                    ...(thread.participantSessions || {}),
                    [params.participantKey]: sessionId,
                },
            }
            void this.syncActThreadUntilIdle({
                channel: params.channel,
                target: params.target,
                act,
                thread: latestThreadAfterSend,
                limitPerParticipant: 20,
                ignoreActiveTurnSessionIds: [sessionId],
            }).catch((error) => {
                console.error('[discord] Team thread sync during message failed:', error)
            })
            await this.refreshActThreadChannelName(params.channel, params.target)
            this.scheduleThreadChannelNameRefresh(params.channel, params.target)
            const reply = await waitForAssistantReply(params.target.workingDir, sessionId, { afterMessageId })
            if (reply.kind === 'message') {
                void this.syncActThreadUntilIdle({
                    channel: params.channel,
                    target: params.target,
                    act,
                    thread: latestThreadAfterSend,
                    limitPerParticipant: 20,
                    ignoreActiveTurnSessionIds: [sessionId],
                }).catch((error) => {
                    console.error('[discord] Team thread sync after message failed:', error)
                })
            } else {
                await this.postAssistantReplyToChannel(params.channel, {
                    workspaceId: params.target.workspaceId,
                    workingDir: params.target.workingDir,
                    channelId: params.channel.id,
                }, sessionId, reply)
                await this.refreshActThreadChannelName(params.channel, params.target)
            }
            return `Sent to ${participantDisplayName(act, params.participantKey)}.`
        } finally {
            stopTyping()
            this.endDiscordSessionTurn(sessionId)
        }
    }
}

export const discordIntegrationService = new DiscordIntegrationService()
