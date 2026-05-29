import {
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import type { DiscordChannelTarget } from '../../../shared/discord-contracts.js'
import { readDiscordMappings } from './config-store.js'
import {
    ensureStandaloneSession,
    findWorkspaceAgent,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'

type DiscordAgentTarget = Extract<DiscordChannelTarget, { kind: 'agent' }>

interface DiscordAgentCommandDeps {
    loadSnapshotForTarget: (target: DiscordAgentTarget) => Promise<DiscordWorkspaceSnapshot>
    ensureAgentThreadChannel: (
        workspaceId: string,
        snapshot: DiscordWorkspaceSnapshot,
        agentId: string,
        sessionId: string,
    ) => Promise<unknown>
}

export async function handleDiscordAgentCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordAgentCommandDeps,
) {
    if (interaction.options.getSubcommand() === 'new') {
        await handleNewAgentThreadCommand(interaction, deps)
    }
}

async function handleNewAgentThreadCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordAgentCommandDeps,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const channel = interaction.channel
    if (!channel?.isTextBased()) {
        await interaction.editReply('This command only works in Studio text channels.')
        return
    }
    const target = (await readDiscordMappings()).channels[interaction.channelId]
    if (!target || target.kind !== 'agent') {
        await interaction.editReply('New standalone agent threads can only be started from agent thread channels.')
        return
    }
    const snapshot = await deps.loadSnapshotForTarget(target)
    const agent = findWorkspaceAgent(snapshot, target.agentId)
    if (!agent) {
        await interaction.editReply('That agent is no longer present in the saved Studio workspace.')
        return
    }
    const sessionId = await ensureStandaloneSession({
        workingDir: target.workingDir,
        agent,
    })
    const threadChannel = await deps.ensureAgentThreadChannel(target.workspaceId, snapshot, target.agentId, sessionId)
    await interaction.editReply(`Created ${threadChannel}.`)
}
