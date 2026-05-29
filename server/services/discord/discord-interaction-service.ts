import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    MessageFlags,
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
    TextChannel,
    type ButtonInteraction,
    type CacheType,
    type CommandInteraction,
    type Interaction,
} from 'discord.js'
import type {
    DiscordChannelTarget,
    DiscordSyncResponse,
} from '../../../shared/discord-contracts.js'
import type { TeamThreadSummary } from '../../../shared/team-types.js'
import { readDiscordMappings } from './config-store.js'
import { truncateDiscordText } from './discord-service-helpers.js'
import type { DiscordAccessGate } from './discord-access-gate.js'
import { handleDiscordAgentCommand } from './discord-agent-commands.js'
import {
    handleDiscordNavigationButton,
    handleDiscordNavigationSelect,
} from './discord-navigation-interactions.js'
import type { DiscordPromptInteractionHandler } from './discord-prompt-interactions.js'
import type {
    DiscordTeamSnapshot,
    DiscordWorkspaceSnapshot,
} from './studio-runtime.js'
import { findWorkspaceTeam } from './studio-runtime.js'
import { handleDiscordTeamCommand } from './discord-team-commands.js'
import { handleDiscordWorkspaceCommand } from './discord-workspace-commands.js'

type DiscordAgentTarget = Extract<DiscordChannelTarget, { kind: 'agent' }>
type DiscordTeamThreadTarget = Extract<DiscordChannelTarget, { kind: 'team-thread' }>

interface DiscordInteractionServiceDeps {
    accessGate: DiscordAccessGate
    promptInteractions: DiscordPromptInteractionHandler
    loadSnapshotForTarget: (target: DiscordChannelTarget) => Promise<DiscordWorkspaceSnapshot>
    syncAllWorkspaces: () => Promise<DiscordSyncResponse>
    syncWorkspace: (workspaceId: string) => Promise<DiscordSyncResponse>
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

export class DiscordInteractionService {
    private readonly deps: DiscordInteractionServiceDeps

    constructor(deps: DiscordInteractionServiceDeps) {
        this.deps = deps
    }

    async handleInteraction(interaction: unknown) {
        if (this.isDiscordInteraction(interaction)) {
            const allowed = await this.deps.accessGate.authorizeInteraction(interaction)
            if (!allowed) {
                if (interaction instanceof AutocompleteInteraction) {
                    await interaction.respond([]).catch(() => {})
                    return
                }
                await this.deps.accessGate.replyUnauthorized(interaction)
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
            await this.deps.promptInteractions.handleModalSubmit(interaction)
        }
    }

    async replyFailure(interaction: Interaction<CacheType>, error: unknown) {
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

    private isDiscordInteraction(interaction: unknown): interaction is Interaction<CacheType> {
        return typeof interaction === 'object' && interaction !== null && 'user' in interaction && 'guildId' in interaction
    }

    private async handleCommand(interaction: ChatInputCommandInteraction) {
        if (interaction.commandName === 'workspace') {
            await handleDiscordWorkspaceCommand(interaction, {
                syncAllWorkspaces: this.deps.syncAllWorkspaces,
                syncWorkspace: this.deps.syncWorkspace,
            })
            return
        }
        if (interaction.commandName === 'agent') {
            await handleDiscordAgentCommand(interaction, {
                loadSnapshotForTarget: (target: DiscordAgentTarget) => this.deps.loadSnapshotForTarget(target),
                ensureAgentThreadChannel: this.deps.ensureAgentThreadChannel,
            })
            return
        }
        if (interaction.commandName === 'team') {
            await handleDiscordTeamCommand(interaction, {
                loadSnapshotForTarget: (target: DiscordTeamThreadTarget) => this.deps.loadSnapshotForTarget(target),
                refreshTeamThreadChannelName: this.deps.refreshTeamThreadChannelName,
                sendTeamParticipantInput: this.deps.sendTeamParticipantInput,
                syncTeamThreadParticipantHistory: this.deps.syncTeamThreadParticipantHistory,
            })
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
        if (!target || target.kind !== 'team-thread') {
            await interaction.respond([]).catch(() => {})
            return
        }
        const snapshot = await this.deps.loadSnapshotForTarget(target).catch(() => null)
        const team = snapshot ? findWorkspaceTeam(snapshot, target.teamId) : null
        if (!team) {
            await interaction.respond([]).catch(() => {})
            return
        }
        const query = String(focused.value || '').trim().toLowerCase()
        const choices = Object.entries(team.participants || {})
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

    private async handleSelect(interaction: StringSelectMenuInteraction) {
        const [prefix] = interaction.customId.split(':')
        if (prefix !== 'apm') {
            return
        }
        if (await this.deps.promptInteractions.handleSelect(interaction)) {
            return
        }
        await handleDiscordNavigationSelect(interaction, {
            syncWorkspace: this.deps.syncWorkspace,
            ensureAgentThreadChannel: this.deps.ensureAgentThreadChannel,
            ensureTeamThreadChannel: this.deps.ensureTeamThreadChannel,
        })
    }

    private async handleButton(interaction: ButtonInteraction) {
        const [prefix] = interaction.customId.split(':')
        if (prefix !== 'apm') {
            return
        }
        if (await this.deps.promptInteractions.handleButton(interaction)) {
            return
        }
        await handleDiscordNavigationButton(interaction, {
            syncWorkspace: this.deps.syncWorkspace,
            ensureAgentThreadChannel: this.deps.ensureAgentThreadChannel,
            ensureTeamThreadChannel: this.deps.ensureTeamThreadChannel,
        })
    }
}
