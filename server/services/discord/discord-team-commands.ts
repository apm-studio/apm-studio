import {
    ChatInputCommandInteraction,
    MessageFlags,
    TextChannel,
} from 'discord.js'
import type { DiscordChannelTarget } from '../../../shared/discord-contracts.js'
import type { TeamThreadSummary } from '../../../shared/team-types.js'
import { readDiscordMappings } from './config-store.js'
import {
    MAX_DISCORD_PROMPT_CHARS,
    participantDisplayName,
} from './discord-service-helpers.js'
import {
    findWorkspaceTeam,
    listTeamThreadsForDiscord,
    type DiscordTeamSnapshot,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'

type DiscordTeamThreadTarget = Extract<DiscordChannelTarget, { kind: 'team-thread' }>

interface DiscordTeamCommandDeps {
    loadSnapshotForTarget: (target: DiscordTeamThreadTarget) => Promise<DiscordWorkspaceSnapshot>
    refreshTeamThreadChannelName: (channel: TextChannel, target: DiscordTeamThreadTarget) => Promise<void>
    sendTeamParticipantInput: (params: {
        channel: TextChannel
        target: DiscordTeamThreadTarget
        participantKey: string
        content: string
    }) => Promise<string>
    syncTeamThreadParticipantHistory: (params: {
        channel: TextChannel
        target: DiscordTeamThreadTarget
        team: DiscordTeamSnapshot
        thread: TeamThreadSummary
        limitPerParticipant: number
    }) => Promise<number>
}

export async function handleDiscordTeamCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordTeamCommandDeps,
) {
    const subcommand = interaction.options.getSubcommand()
    if (subcommand === 'participants') {
        await handleTeamParticipantsCommand(interaction, deps)
        return
    }
    if (subcommand === 'message') {
        await handleTeamMessageCommand(interaction, deps)
        return
    }
    if (subcommand === 'sync') {
        await handleTeamSyncCommand(interaction, deps)
    }
}

async function resolveTeamThreadTarget(interaction: ChatInputCommandInteraction) {
    const target = (await readDiscordMappings()).channels[interaction.channelId]
    return target?.kind === 'team-thread'
        ? target
        : null
}

async function handleTeamParticipantsCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordTeamCommandDeps,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const target = await resolveTeamThreadTarget(interaction)
    if (!target) {
        await interaction.editReply('Team agents are only available from Team thread channels.')
        return
    }
    const snapshot = await deps.loadSnapshotForTarget(target)
    const team = findWorkspaceTeam(snapshot, target.teamId)
    if (!team) {
        await interaction.editReply('That Team is no longer present in the saved Studio workspace.')
        return
    }
    const lines = Object.keys(team.participants || {}).map((participantKey) => {
        const name = participantDisplayName(team, participantKey)
        return `- ${name}`
    })
    await interaction.editReply({
        content: lines.length
            ? `Agents for this Team thread:\n${lines.join('\n')}`
            : 'This Team has no agents.',
        allowedMentions: { parse: [] },
    })
}

async function handleTeamMessageCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordTeamCommandDeps,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    if (!(interaction.channel instanceof TextChannel)) {
        await interaction.editReply('Team messages can only be sent from Team thread text channels.')
        return
    }
    const target = await resolveTeamThreadTarget(interaction)
    if (!target) {
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
    const snapshot = await deps.loadSnapshotForTarget(target)
    const team = findWorkspaceTeam(snapshot, target.teamId)
    if (!team) {
        await interaction.editReply('That Team is no longer present in the saved Studio workspace.')
        return
    }
    if (!team.participants?.[participantKey]) {
        const names = Object.keys(team.participants || {}).map((key) => participantDisplayName(team, key))
        await interaction.editReply({
            content: names.length
                ? `That agent is not in this Team thread. Use the agent autocomplete for one of: ${names.join(', ')}.`
                : 'This Team has no agents.',
            allowedMentions: { parse: [] },
        })
        return
    }
    const result = await deps.sendTeamParticipantInput({
        channel: interaction.channel,
        target,
        participantKey,
        content,
    })
    await interaction.editReply(result)
}

async function handleTeamSyncCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordTeamCommandDeps,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const channel = interaction.channel
    if (!(channel instanceof TextChannel)) {
        await interaction.editReply('Team sync only works in Team thread text channels.')
        return
    }
    const target = await resolveTeamThreadTarget(interaction)
    if (!target) {
        await interaction.editReply('Team sync only works from Team thread channels.')
        return
    }
    const snapshot = await deps.loadSnapshotForTarget(target)
    const team = findWorkspaceTeam(snapshot, target.teamId)
    if (!team) {
        await interaction.editReply('That Team is no longer present in the saved Studio workspace.')
        return
    }
    const threads = await listTeamThreadsForDiscord(target.workingDir, target.teamId)
    const thread = threads.threads.find((entry) => entry.id === target.threadId)
    if (!thread) {
        await interaction.editReply('That Team thread is no longer available.')
        return
    }
    const count = await deps.syncTeamThreadParticipantHistory({
        channel,
        target,
        team,
        thread,
        limitPerParticipant: 20,
    })
    await deps.refreshTeamThreadChannelName(channel, target)
    await interaction.editReply(count > 0
        ? `Synced ${count} recent agent message${count === 1 ? '' : 's'} into this Team thread.`
        : 'This Team thread is already up to date.')
}
