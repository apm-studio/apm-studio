import {
    Message,
    TextChannel,
} from 'discord.js'
import type { DiscordChannelTarget } from '../../../shared/discord-contracts.js'
import {
    readDiscordMappings,
    updateDiscordMappings,
} from './config-store.js'
import {
    MAX_DISCORD_PROMPT_CHARS,
    participantDisplayName,
} from './discord-service-helpers.js'
import type { DiscordOutputPresenter } from './discord-output-presenter.js'
import type { DiscordPromptInteractionHandler } from './discord-prompt-interactions.js'
import type { DiscordSessionTurnTracker } from './discord-session-turn-tracker.js'
import type { DiscordTeamThreadSyncService } from './discord-team-thread-sync-service.js'
import type { DiscordThreadChannelManager } from './discord-thread-channel-manager.js'
import {
    describeDiscordSessionBlock,
    ensureTeamParticipantSession,
    ensureStandaloneSession,
    findWorkspaceAgent,
    findWorkspaceTeam,
    getLatestDiscordAssistantMessageId,
    listTeamThreadsForDiscord,
    resolveTeamParticipantAgent,
    sendAgentDiscordMessage,
    sendTeamParticipantDiscordMessage,
    waitForAssistantReply,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'

type DiscordAgentTarget = Extract<DiscordChannelTarget, { kind: 'agent' }>
type DiscordTeamThreadTarget = Extract<DiscordChannelTarget, { kind: 'team-thread' }>

interface DiscordMessageServiceDeps {
    authorizeMessage: (message: Message) => Promise<boolean>
    markMessageContentLikelyMissing: () => void
    loadSnapshotForTarget: (target: DiscordChannelTarget) => Promise<DiscordWorkspaceSnapshot>
    outputPresenter: DiscordOutputPresenter
    promptInteractions: DiscordPromptInteractionHandler
    sessionTurns: DiscordSessionTurnTracker
    teamThreadSync: DiscordTeamThreadSyncService
    threadChannels: DiscordThreadChannelManager
}

export class DiscordMessageService {
    private readonly deps: DiscordMessageServiceDeps

    constructor(deps: DiscordMessageServiceDeps) {
        this.deps = deps
    }

    async handleMessage(message: Message) {
        if (message.author.bot || !message.guildId) {
            return
        }
        if (!(await this.deps.authorizeMessage(message))) {
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
            this.deps.markMessageContentLikelyMissing()
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

        if (target.kind === 'agent') {
            await this.handleAgentMessage(message, target, content)
            return
        }
        await this.handleTeamThreadMessage(message)
    }

    async sendTeamParticipantInput(params: {
        channel: TextChannel
        target: DiscordTeamThreadTarget
        participantKey: string
        content: string
    }) {
        const snapshot = await this.deps.loadSnapshotForTarget(params.target)
        const team = findWorkspaceTeam(snapshot, params.target.teamId)
        if (!team) {
            return 'That Team is no longer present in the saved Studio workspace.'
        }
        const threads = await listTeamThreadsForDiscord(params.target.workingDir, params.target.teamId)
        const thread = threads.threads.find((entry) => entry.id === params.target.threadId)
        if (!thread) {
            return 'That Team thread is no longer available.'
        }
        for (const [runningParticipantKey, runningSessionId] of Object.entries(thread.participantSessions || {})) {
            if (!runningSessionId) continue
            if (this.deps.sessionTurns.isActive(runningSessionId)) {
                return `This Team thread is already handling a Discord message for ${participantDisplayName(team, runningParticipantKey)}. Wait for the current turn to finish before sending another message.`
            }
            const block = await describeDiscordSessionBlock(params.target.workingDir, runningSessionId)
            if (block.blocked) {
                const detail = block.reason === 'permission'
                    ? 'waiting for a permission response'
                    : block.reason === 'question'
                        ? 'waiting for a question response'
                        : 'still running'
                const reposted = (block.reason === 'permission' || block.reason === 'question')
                    ? await this.deps.promptInteractions.postPendingInteractionIfMissing({
                        channel: params.channel,
                        workspaceId: params.target.workspaceId,
                        workingDir: params.target.workingDir,
                        sessionId: runningSessionId,
                    })
                    : false
                return `This Team thread cannot accept new Discord messages because ${participantDisplayName(team, runningParticipantKey)} is ${detail}.${reposted ? ' I reposted the pending Studio prompt in this channel.' : ''}`
            }
        }

        const agent = resolveTeamParticipantAgent(snapshot, team, params.participantKey)
        if (!agent) {
            return `Cannot resolve agent for "${participantDisplayName(team, params.participantKey)}".`
        }
        if (!agent.model) {
            return `Configure a model for "${agent.name}" in APM Studio before chatting from Discord.`
        }

        const sessionId = await ensureTeamParticipantSession({
            workingDir: params.target.workingDir,
            teamId: params.target.teamId,
            thread,
            participantKey: params.participantKey,
            agent,
        })
        const sessionBlock = await describeDiscordSessionBlock(params.target.workingDir, sessionId)
        if (sessionBlock.blocked) {
            const reposted = (sessionBlock.reason === 'permission' || sessionBlock.reason === 'question')
                ? await this.deps.promptInteractions.postPendingInteractionIfMissing({
                    channel: params.channel,
                    workspaceId: params.target.workspaceId,
                    workingDir: params.target.workingDir,
                    sessionId,
                })
                : false
            const message = sessionBlock.message || 'This Studio thread is not ready for another message yet.'
            return reposted ? `${message} I reposted the pending Studio prompt in this channel.` : message
        }
        if (!this.deps.sessionTurns.begin(sessionId)) {
            return 'This Studio thread is already handling a Discord message. Wait for the current reply to finish before sending another one.'
        }
        const stopTyping = this.startTypingIndicator(params.channel)
        try {
            const afterMessageId = await getLatestDiscordAssistantMessageId(params.target.workingDir, sessionId).catch(() => null)
            await updateDiscordMappings((mappings) => {
                const current = mappings.channels[params.channel.id]
                if (current?.kind === 'team-thread') {
                    current.sessionIds ||= {}
                    current.sessionIds[params.participantKey] = sessionId
                }
            })
            params.target.sessionIds = {
                ...(params.target.sessionIds || {}),
                [params.participantKey]: sessionId,
            }
            await params.channel.send({
                content: `**[APM User -> ${participantDisplayName(team, params.participantKey)}]**\n${params.content}`,
                allowedMentions: { parse: [] },
            })
            await sendTeamParticipantDiscordMessage({
                workingDir: params.target.workingDir,
                sessionId,
                teamId: params.target.teamId,
                threadId: params.target.threadId,
                participantKey: params.participantKey,
                agent,
                message: params.content,
            })
            const latestThreadsAfterSend = await listTeamThreadsForDiscord(params.target.workingDir, params.target.teamId).catch(() => threads)
            const latestThreadAfterSend = latestThreadsAfterSend.threads.find((entry) => entry.id === params.target.threadId) || {
                ...thread,
                participantSessions: {
                    ...(thread.participantSessions || {}),
                    [params.participantKey]: sessionId,
                },
            }
            void this.deps.teamThreadSync.syncUntilIdle({
                channel: params.channel,
                target: params.target,
                team,
                thread: latestThreadAfterSend,
                limitPerParticipant: 20,
                ignoreActiveTurnSessionIds: [sessionId],
            }).catch((error) => {
                console.error('[discord] Team thread sync during message failed:', error)
            })
            await this.deps.threadChannels.refreshTeamThreadChannelName(params.channel, params.target)
            this.deps.threadChannels.scheduleThreadChannelNameRefresh(params.channel, params.target)
            const reply = await waitForAssistantReply(params.target.workingDir, sessionId, { afterMessageId })
            if (reply.kind === 'message') {
                void this.deps.teamThreadSync.syncUntilIdle({
                    channel: params.channel,
                    target: params.target,
                    team,
                    thread: latestThreadAfterSend,
                    limitPerParticipant: 20,
                    ignoreActiveTurnSessionIds: [sessionId],
                }).catch((error) => {
                    console.error('[discord] Team thread sync after message failed:', error)
                })
            } else {
                await this.deps.outputPresenter.postAssistantReplyToChannel(params.channel, {
                    workspaceId: params.target.workspaceId,
                    workingDir: params.target.workingDir,
                    channelId: params.channel.id,
                }, sessionId, reply)
                await this.deps.threadChannels.refreshTeamThreadChannelName(params.channel, params.target)
            }
            return `Sent to ${participantDisplayName(team, params.participantKey)}.`
        } finally {
            stopTyping()
            this.deps.sessionTurns.end(sessionId)
        }
    }

    private async handleAgentMessage(message: Message, target: DiscordAgentTarget, content: string) {
        const snapshot = await this.deps.loadSnapshotForTarget(target)
        const agent = findWorkspaceAgent(snapshot, target.agentId)
        if (!agent) {
            await message.reply({ content: 'That agent is no longer present in the saved Studio workspace.', allowedMentions: { parse: [] } })
            return
        }
        if (!agent.model) {
            await message.reply({ content: `Configure a model for "${agent.name}" in APM Studio before chatting from Discord.`, allowedMentions: { parse: [] } })
            return
        }

        const sessionId = await ensureStandaloneSession({
            workingDir: target.workingDir,
            agent,
            sessionId: target.sessionId,
        })
        if (await this.replyIfSessionBlocked(message, target.workingDir, sessionId)) {
            return
        }
        if (!this.deps.sessionTurns.begin(sessionId)) {
            await this.replyIfSessionBlocked(message, target.workingDir, sessionId)
            return
        }
        const stopTyping = this.startTypingIndicator(message.channel instanceof TextChannel ? message.channel : null)
        try {
            const afterMessageId = await getLatestDiscordAssistantMessageId(target.workingDir, sessionId).catch(() => null)
            await updateDiscordMappings((mappings) => {
                const current = mappings.channels[message.channelId]
                if (current?.kind === 'agent') {
                    current.sessionId = sessionId
                }
            })
            await sendAgentDiscordMessage({
                workingDir: target.workingDir,
                sessionId,
                agent,
                message: content,
            })
            if (message.channel instanceof TextChannel) {
                await this.deps.threadChannels.refreshAgentThreadChannelName(message.channel, target, sessionId)
                this.deps.threadChannels.scheduleThreadChannelNameRefresh(message.channel, target, sessionId)
            }
            const reply = await waitForAssistantReply(target.workingDir, sessionId, { afterMessageId })
            await this.deps.outputPresenter.postAssistantReplyToMessage(message, target, sessionId, reply)
            if (message.channel instanceof TextChannel) {
                await this.deps.threadChannels.refreshAgentThreadChannelName(message.channel, target, sessionId)
            }
        } finally {
            stopTyping()
            this.deps.sessionTurns.end(sessionId)
        }
    }

    private async handleTeamThreadMessage(message: Message) {
        await message.reply({
            content: 'Use `/team message` in this Team thread to choose an agent and send a message. Direct Team chat messages are not routed.',
            allowedMentions: { parse: [] },
        })
    }

    private async replyIfSessionBlocked(message: Message, workingDir: string, sessionId: string) {
        if (this.deps.sessionTurns.isActive(sessionId)) {
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
                if (target?.workspaceId && await this.deps.promptInteractions.postPendingInteractionIfMissing({
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
}
