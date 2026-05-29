import {
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import type { DiscordSyncResponse } from '../../../shared/discord-contracts.js'
import {
    getSavedWorkspace,
    listSavedWorkspaces,
} from '../workspace/service.js'
import { readDiscordMappings } from './config-store.js'
import {
    workspaceLabel,
    workspaceSnapshotFromSaved,
} from './discord-service-helpers.js'

interface DiscordWorkspaceCommandDeps {
    syncAllWorkspaces: () => Promise<DiscordSyncResponse>
    syncWorkspace: (workspaceId: string) => Promise<DiscordSyncResponse>
}

export async function handleDiscordWorkspaceCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordWorkspaceCommandDeps,
) {
    const subcommand = interaction.options.getSubcommand()
    if (subcommand === 'active') {
        await handleWorkspaceActiveCommand(interaction)
        return
    }
    if (subcommand === 'control') {
        await handleWorkspaceControlCommand(interaction, deps)
        return
    }
    if (subcommand === 'sync') {
        await handleWorkspaceSyncCommand(interaction, deps)
        return
    }
    if (subcommand === 'switch') {
        await handleWorkspaceSwitchCommand(interaction, deps)
    }
}

async function handleWorkspaceActiveCommand(interaction: ChatInputCommandInteraction) {
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
    const snapshot = workspaceSnapshotFromSaved(saved.workspace)
    await interaction.editReply(`Active workspace: ${workspaceLabel(snapshot.workingDir)}\n${snapshot.workingDir}`)
}

async function handleWorkspaceControlCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordWorkspaceCommandDeps,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const mappings = await readDiscordMappings()
    const target = mappings.channels[interaction.channelId]
    const workspaceId = target?.workspaceId || mappings.activeWorkspaceId
    if (!workspaceId) {
        await interaction.editReply('No active Studio workspace is synced yet.')
        return
    }
    await deps.syncWorkspace(workspaceId)
    await interaction.editReply('Studio control refreshed.')
}

async function handleWorkspaceSyncCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordWorkspaceCommandDeps,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const result = await deps.syncAllWorkspaces()
    const failures = result.failedWorkspaces || []
    const failureSummary = failures.length > 0
        ? `\nFailed ${failures.length}: ${failures.slice(0, 3).map((failure) => `${failure.workingDir}: ${failure.error}`).join(' | ')}${failures.length > 3 ? ' | ...' : ''}`
        : ''
    await interaction.editReply(`Synced the active Studio workspace and refreshed the workspace selector.${failureSummary}`)
}

async function handleWorkspaceSwitchCommand(
    interaction: ChatInputCommandInteraction,
    deps: DiscordWorkspaceCommandDeps,
) {
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
    await deps.syncWorkspace(matches[0].id)
    await interaction.editReply(`Active workspace switched to ${workspaceLabel(matches[0].workingDir)}.`)
}
