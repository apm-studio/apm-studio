import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type Message,
    type TextChannel,
} from 'discord.js'
import type { DiscordChannelTarget } from '../../../shared/discord-contracts.js'
import { getOrCreateWorkspaceMapping, readDiscordMappings, updateDiscordMappings } from './config-store.js'
import {
    chunkDiscordMessage,
    DISCORD_SEND_RETRY_DELAYS_MS,
    formatPermissionPrompt,
    formatQuestionPrompt,
    sleep,
} from './discord-service-helpers.js'
import type { DiscordAssistantReply } from './studio-runtime.js'
import { listDiscordBackfillMessages } from './studio-runtime.js'
import type { DiscordPendingInteractionStore } from './discord-pending-interactions.js'

interface DiscordOutputPresenterDeps {
    pendingInteractions: DiscordPendingInteractionStore
    noteDiscordIssue: (message: string, error?: unknown) => void
}

export class DiscordOutputPresenter {
    private readonly deps: DiscordOutputPresenterDeps

    constructor(deps: DiscordOutputPresenterDeps) {
        this.deps = deps
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
        this.deps.noteDiscordIssue(`Discord send failed (${label})`, lastError)
        throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }

    private sendChannelMessage(channel: TextChannel, options: Parameters<TextChannel['send']>[0]) {
        return this.withDiscordSendRetry('channel message', () => channel.send(options))
    }

    private replyToMessage(message: Message, options: Parameters<Message['reply']>[0]) {
        return this.withDiscordSendRetry('message reply', () => message.reply(options))
    }

    async postAssistantReplyToMessage(message: Message, target: DiscordChannelTarget, sessionId: string, reply: DiscordAssistantReply) {
        if (reply.kind === 'message') {
            for (const chunk of chunkDiscordMessage(reply.content)) {
                await this.replyToMessage(message, { content: chunk, allowedMentions: { parse: [] } })
            }
            return
        }

        if (reply.kind === 'permission') {
            const pendingId = await this.deps.pendingInteractions.register({
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
                await this.deps.pendingInteractions.clear(pendingId).catch(() => {})
                throw error
            }
            return
        }

        const pendingId = await this.deps.pendingInteractions.register({
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
            await this.deps.pendingInteractions.clear(pendingId).catch(() => {})
            throw error
        }
    }

    async postAssistantReplyToChannel(
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
            const pendingId = await this.deps.pendingInteractions.register({
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
                await this.deps.pendingInteractions.clear(pendingId).catch(() => {})
                throw error
            }
            return
        }

        const pendingId = await this.deps.pendingInteractions.register({
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
            await this.deps.pendingInteractions.clear(pendingId).catch(() => {})
            throw error
        }
    }

    async backfillSessionHistory(params: {
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
}
