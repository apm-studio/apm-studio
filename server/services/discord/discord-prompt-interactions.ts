import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
    type ButtonInteraction,
    type ModalSubmitInteraction,
    type StringSelectMenuInteraction,
} from 'discord.js'
import type { ChatQuestionAnswer, ChatQuestionRequest } from '../../../shared/chat-contracts.js'
import type { DiscordChannelTarget } from '../../../shared/discord-contracts.js'
import type { TeamThreadSummary } from '../../../shared/team-types.js'
import { readDiscordMappings } from './config-store.js'
import {
    formatQuestionPrompt,
    truncateDiscordText,
} from './discord-service-helpers.js'
import type { DiscordOutputPresenter } from './discord-output-presenter.js'
import type { DiscordPendingInteractionStore } from './discord-pending-interactions.js'
import {
    findPendingStudioInteraction,
    findWorkspaceTeam,
    getLatestDiscordAssistantMessageId,
    listTeamThreadsForDiscord,
    rejectDiscordQuestion,
    respondDiscordPermission,
    respondDiscordQuestion,
    waitForAssistantReply,
    type DiscordAssistantReply,
    type DiscordTeamSnapshot,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'

type DiscordTeamThreadTarget = Extract<DiscordChannelTarget, { kind: 'team-thread' }>

interface DiscordPromptInteractionDeps {
    pendingInteractions: DiscordPendingInteractionStore
    outputPresenter: DiscordOutputPresenter
    loadSnapshotForTarget: (target: DiscordTeamThreadTarget) => Promise<DiscordWorkspaceSnapshot>
    startTypingIndicator: (channel: TextChannel) => () => void
    syncTeamThreadUntilIdle: (params: {
        channel: TextChannel
        target: DiscordTeamThreadTarget
        team: DiscordTeamSnapshot
        thread: TeamThreadSummary
        limitPerParticipant: number
    }) => Promise<number>
}

export class DiscordPromptInteractionHandler {
    private readonly deps: DiscordPromptInteractionDeps

    constructor(deps: DiscordPromptInteractionDeps) {
        this.deps = deps
    }

    async handleSelect(interaction: StringSelectMenuInteraction) {
        const [prefix, kind, pendingId] = interaction.customId.split(':')
        if (prefix !== 'apm' || kind !== 'q-select' || !pendingId) {
            return false
        }
        await this.handleQuestionSelect(interaction, pendingId)
        return true
    }

    async handleButton(interaction: ButtonInteraction) {
        const [prefix, kind] = interaction.customId.split(':')
        if (prefix !== 'apm') {
            return false
        }
        if (kind === 'perm') {
            await this.handlePermissionButton(interaction)
            return true
        }
        if (kind === 'q-answer') {
            await this.handleQuestionAnswerButton(interaction)
            return true
        }
        if (kind === 'q-custom') {
            await this.handleQuestionCustomButton(interaction)
            return true
        }
        if (kind === 'q-reject') {
            await this.handleQuestionRejectButton(interaction)
            return true
        }
        return false
    }

    async handleModalSubmit(interaction: ModalSubmitInteraction) {
        const [prefix, kind, pendingId] = interaction.customId.split(':')
        if (prefix !== 'apm' || kind !== 'q-submit' || !pendingId) {
            return false
        }
        const pending = await this.deps.pendingInteractions.require(pendingId, interaction.channelId)
        if (pending.kind !== 'question') {
            await interaction.reply({ content: 'That prompt is not a question.', flags: MessageFlags.Ephemeral })
            return true
        }
        const request = pending.request as ChatQuestionRequest
        const answers: ChatQuestionAnswer[] = (request.questions || []).slice(0, 5).map((question, index) => {
            const raw = interaction.fields.getTextInputValue(`answer_${index}`).trim()
            if (question.multiple) {
                return raw.split(',').map((value) => value.trim()).filter(Boolean)
            }
            return raw ? [raw] : []
        })
        await this.submitQuestionAnswers(interaction, pendingId, answers)
        return true
    }

    async postPendingInteractionIfMissing(params: {
        channel: TextChannel
        workspaceId: string
        workingDir: string
        sessionId: string
    }) {
        const reply = await findPendingStudioInteraction(params.workingDir, params.sessionId).catch(() => null)
        if (!reply || reply.kind === 'message') {
            return false
        }
        if (await this.deps.pendingInteractions.hasFreshPrompt({
            channelId: params.channel.id,
            sessionId: params.sessionId,
            kind: reply.kind,
            requestId: typeof reply.request.id === 'string' ? reply.request.id : '',
        })) {
            return false
        }
        await this.deps.outputPresenter.postAssistantReplyToChannel(params.channel, {
            workspaceId: params.workspaceId,
            workingDir: params.workingDir,
            channelId: params.channel.id,
        }, params.sessionId, reply)
        return true
    }

    private async showQuestionAnswerModal(interaction: ButtonInteraction, pendingId: string) {
        const pending = await this.deps.pendingInteractions.require(pendingId, interaction.channelId)
        if (pending.kind !== 'question') {
            await interaction.reply({ content: 'That prompt is not a question.', flags: MessageFlags.Ephemeral })
            return
        }
        const request = pending.request as ChatQuestionRequest
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
        answers: ChatQuestionAnswer[],
    ) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const pending = await this.deps.pendingInteractions.require(pendingId, interaction.channelId)
        if (pending.kind !== 'question') {
            await interaction.editReply('That prompt is not a question.')
            return
        }
        const request = pending.request as ChatQuestionRequest
        const questionId = typeof request.id === 'string' ? request.id : ''
        if (!questionId) {
            await interaction.editReply('That question request is missing its id.')
            return
        }
        const afterMessageId = await getLatestDiscordAssistantMessageId(pending.workingDir, pending.sessionId).catch(() => null)
        await respondDiscordQuestion(pending.workingDir, questionId, answers)
        await this.deps.pendingInteractions.clear(pendingId)
        await interaction.editReply('Answer submitted.')
        if (interaction.channel?.isTextBased() && interaction.channel instanceof TextChannel) {
            const stopTyping = this.deps.startTypingIndicator(interaction.channel)
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

    private async handlePermissionButton(interaction: ButtonInteraction) {
        const [, , pendingId, response] = interaction.customId.split(':') as Array<string>
        if (response !== 'once' && response !== 'always' && response !== 'reject') {
            await interaction.reply({ content: 'Unknown permission response.', flags: MessageFlags.Ephemeral })
            return
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const pending = await this.deps.pendingInteractions.require(pendingId, interaction.channelId)
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
        await this.deps.pendingInteractions.clear(pendingId)
        await interaction.editReply(response === 'reject' ? 'Permission denied.' : `Permission allowed ${response === 'always' ? 'always' : 'once'}.`)
        if (response !== 'reject' && interaction.channel?.isTextBased() && interaction.channel instanceof TextChannel) {
            const stopTyping = this.deps.startTypingIndicator(interaction.channel)
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
        if (reply.kind === 'message' && target?.kind === 'team-thread') {
            const snapshot = await this.deps.loadSnapshotForTarget(target)
            const team = findWorkspaceTeam(snapshot, target.teamId)
            if (!team) {
                await this.deps.outputPresenter.postAssistantReplyToChannel(channel, pending, sessionId, reply)
                return
            }
            const threads = await listTeamThreadsForDiscord(target.workingDir, target.teamId).catch(() => ({ threads: [] }))
            const thread = threads.threads.find((entry) => entry.id === target.threadId)
            if (!thread) {
                await this.deps.outputPresenter.postAssistantReplyToChannel(channel, pending, sessionId, reply)
                return
            }
            void this.deps.syncTeamThreadUntilIdle({
                channel,
                target,
                team,
                thread,
                limitPerParticipant: 20,
            }).catch((error) => {
                console.error('[discord] Team thread sync after pending continuation failed:', error)
            })
            return
        }
        await this.deps.outputPresenter.postAssistantReplyToChannel(channel, pending, sessionId, reply)
    }

    private async handleQuestionAnswerButton(interaction: ButtonInteraction) {
        const [, , pendingId] = interaction.customId.split(':')
        const pending = await this.deps.pendingInteractions.require(pendingId, interaction.channelId)
        if (pending.kind !== 'question') {
            await interaction.reply({ content: 'That prompt is not a question.', flags: MessageFlags.Ephemeral })
            return
        }
        const request = pending.request as ChatQuestionRequest
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
        const pending = await this.deps.pendingInteractions.require(pendingId, interaction.channelId)
        if (pending.kind !== 'question') {
            await interaction.reply({ content: 'That prompt is not a question.', flags: MessageFlags.Ephemeral })
            return
        }
        const request = pending.request as ChatQuestionRequest
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
        const pending = await this.deps.pendingInteractions.require(pendingId, interaction.channelId)
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
        await this.deps.pendingInteractions.clear(pendingId)
        await interaction.editReply('Question cancelled.')
    }
}
