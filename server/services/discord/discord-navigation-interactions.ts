import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    StringSelectMenuBuilder,
    type ButtonInteraction,
    type StringSelectMenuInteraction,
} from 'discord.js'
import { getSavedWorkspace } from '../workspace/service.js'
import { workspaceSnapshotFromSaved } from './discord-service-helpers.js'
import { unnamedThreadNameFor } from './sync-plan.js'
import {
    createTeamThreadForDiscord,
    ensureStandaloneSession,
    findWorkspaceAgent,
    findWorkspaceTeam,
    listStandaloneThreadsForDiscord,
    listTeamThreadsForDiscord,
    type DiscordTeamSnapshot,
    type DiscordWorkspaceSnapshot,
} from './studio-runtime.js'

interface DiscordNavigationDeps {
    syncWorkspace: (workspaceId: string) => Promise<unknown>
    ensureAgentThreadChannel: (
        workspaceId: string,
        snapshot: DiscordWorkspaceSnapshot,
        agentId: string,
        sessionId: string,
    ) => Promise<unknown>
    ensureTeamThreadChannel: (
        workspaceId: string,
        snapshot: DiscordWorkspaceSnapshot,
        team: DiscordTeamSnapshot,
        threadId: string,
    ) => Promise<unknown>
}

type ParsedInteractionId = {
    kind: string
    workspaceId?: string
    entityId?: string
}

function parseApmInteractionId(customId: string): ParsedInteractionId | null {
    const [prefix, kind, workspaceId, entityId] = customId.split(':')
    if (prefix !== 'apm' || !kind) {
        return null
    }
    return { kind, workspaceId, entityId }
}

async function loadWorkspaceSnapshot(workspaceId: string) {
    const saved = await getSavedWorkspace(workspaceId)
    return saved.ok
        ? { ok: true as const, snapshot: workspaceSnapshotFromSaved(saved.workspace) }
        : { ok: false as const, error: saved.error }
}

export async function handleDiscordNavigationSelect(
    interaction: StringSelectMenuInteraction,
    deps: DiscordNavigationDeps,
) {
    const parsed = parseApmInteractionId(interaction.customId)
    if (!parsed?.workspaceId) {
        return false
    }
    const value = interaction.values[0]
    if (!value) {
        await interaction.reply({ content: 'Nothing selected.', flags: MessageFlags.Ephemeral })
        return true
    }

    if (parsed.kind === 'workspace') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        await deps.syncWorkspace(value)
        await interaction.editReply('Active Studio workspace switched.')
        return true
    }

    const loaded = await loadWorkspaceSnapshot(parsed.workspaceId)
    if (!loaded.ok) {
        await interaction.reply({ content: loaded.error, flags: MessageFlags.Ephemeral })
        return true
    }
    const { snapshot } = loaded

    if (parsed.kind === 'agent') {
        await replyWithAgentThreadPicker(interaction, parsed.workspaceId, snapshot, value)
        return true
    }

    if (parsed.kind === 'agent-thread') {
        if (!parsed.entityId) {
            await interaction.reply({ content: 'Agent not found in the selected action.', flags: MessageFlags.Ephemeral })
            return true
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const channel = await deps.ensureAgentThreadChannel(parsed.workspaceId, snapshot, parsed.entityId, value)
        await interaction.editReply(`Opened ${channel}.`)
        return true
    }

    if (parsed.kind === 'team') {
        await replyWithTeamThreadPicker(interaction, parsed.workspaceId, snapshot, value)
        return true
    }

    if (parsed.kind === 'team-thread') {
        if (!parsed.entityId) {
            await interaction.reply({ content: 'Team not found in the selected action.', flags: MessageFlags.Ephemeral })
            return true
        }
        const team = findWorkspaceTeam(snapshot, parsed.entityId)
        if (!team) {
            await interaction.reply({ content: 'Team not found in the saved workspace.', flags: MessageFlags.Ephemeral })
            return true
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const channel = await deps.ensureTeamThreadChannel(parsed.workspaceId, snapshot, team, value)
        await interaction.editReply(`Opened ${channel}.`)
        return true
    }

    return false
}

export async function handleDiscordNavigationButton(
    interaction: ButtonInteraction,
    deps: DiscordNavigationDeps,
) {
    const parsed = parseApmInteractionId(interaction.customId)
    if (!parsed?.workspaceId) {
        return false
    }

    if (parsed.kind === 'sync') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        await deps.syncWorkspace(parsed.workspaceId)
        await interaction.editReply('Workspace synced.')
        return true
    }

    if (parsed.kind === 'new-agent-thread') {
        if (!parsed.entityId) {
            await interaction.reply({ content: 'Agent not found in the selected action.', flags: MessageFlags.Ephemeral })
            return true
        }
        await createAgentThreadFromButton(interaction, parsed.workspaceId, parsed.entityId, deps)
        return true
    }

    if (parsed.kind === 'new-team-thread') {
        if (!parsed.entityId) {
            await interaction.reply({ content: 'Team not found in the selected action.', flags: MessageFlags.Ephemeral })
            return true
        }
        await createTeamThreadFromButton(interaction, parsed.workspaceId, parsed.entityId, deps)
        return true
    }

    return false
}

async function replyWithAgentThreadPicker(
    interaction: StringSelectMenuInteraction,
    workspaceId: string,
    snapshot: DiscordWorkspaceSnapshot,
    agentId: string,
) {
    const agent = findWorkspaceAgent(snapshot, agentId)
    if (!agent) {
        await interaction.reply({ content: 'Agent not found in the saved workspace.', flags: MessageFlags.Ephemeral })
        return
    }
    const threads = (await listStandaloneThreadsForDiscord(snapshot.workingDir, agent.id)).slice(0, 25)
    const components: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = []
    if (threads.length > 0) {
        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`apm:agent-thread:${workspaceId}:${agent.id}`)
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
            .setCustomId(`apm:new-agent-thread:${workspaceId}:${agent.id}`)
            .setLabel('New agent thread')
            .setStyle(ButtonStyle.Primary),
    ))
    await interaction.reply({
        content: `Agent: **${agent.name}**`,
        components: components.slice(0, 5),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
    })
}

async function replyWithTeamThreadPicker(
    interaction: StringSelectMenuInteraction,
    workspaceId: string,
    snapshot: DiscordWorkspaceSnapshot,
    teamId: string,
) {
    const team = findWorkspaceTeam(snapshot, teamId)
    if (!team) {
        await interaction.reply({ content: 'Team not found in the saved workspace.', flags: MessageFlags.Ephemeral })
        return
    }
    const threads = (await listTeamThreadsForDiscord(snapshot.workingDir, team.id)).threads.slice(0, 25)
    const components: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = []
    if (threads.length > 0) {
        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`apm:team-thread:${workspaceId}:${team.id}`)
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
            .setCustomId(`apm:new-team-thread:${workspaceId}:${team.id}`)
            .setLabel('New Team thread')
            .setStyle(ButtonStyle.Primary),
    ))
    await interaction.reply({
        content: `Team: **${team.name}**`,
        components: components.slice(0, 5),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
    })
}

async function createAgentThreadFromButton(
    interaction: ButtonInteraction,
    workspaceId: string,
    agentId: string,
    deps: DiscordNavigationDeps,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const loaded = await loadWorkspaceSnapshot(workspaceId)
    if (!loaded.ok) {
        await interaction.editReply(loaded.error)
        return
    }
    const agent = findWorkspaceAgent(loaded.snapshot, agentId)
    if (!agent) {
        await interaction.editReply('Agent not found in the saved workspace.')
        return
    }
    const sessionId = await ensureStandaloneSession({
        workingDir: loaded.snapshot.workingDir,
        agent,
    })
    const channel = await deps.ensureAgentThreadChannel(workspaceId, loaded.snapshot, agent.id, sessionId)
    await interaction.editReply(`Created ${channel}.`)
}

async function createTeamThreadFromButton(
    interaction: ButtonInteraction,
    workspaceId: string,
    teamId: string,
    deps: DiscordNavigationDeps,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const loaded = await loadWorkspaceSnapshot(workspaceId)
    if (!loaded.ok) {
        await interaction.editReply(loaded.error)
        return
    }
    const team = findWorkspaceTeam(loaded.snapshot, teamId)
    if (!team) {
        await interaction.editReply('Team not found in the saved workspace.')
        return
    }
    const result = await createTeamThreadForDiscord(loaded.snapshot.workingDir, team, loaded.snapshot)
    const channel = await deps.ensureTeamThreadChannel(workspaceId, loaded.snapshot, team, result.thread.id)
    await interaction.editReply(`Created ${channel}.`)
}
