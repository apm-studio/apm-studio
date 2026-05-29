import {
    MessageFlags,
    PermissionFlagsBits,
    type CacheType,
    type CommandInteraction,
    type Interaction,
    type Message,
} from 'discord.js'
import { isDiscordActorAuthorized, type DiscordActorAccess } from './access-control.js'
import { readDiscordConfig } from './config-store.js'

export class DiscordAccessGate {
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

    async authorizeInteraction(interaction: Interaction<CacheType>) {
        if (!interaction.guildId) {
            return false
        }
        const config = await readDiscordConfig()
        if (config.guildId && interaction.guildId !== config.guildId) {
            return false
        }
        return isDiscordActorAuthorized(config, this.actorFromInteraction(interaction))
    }

    async authorizeMessage(message: Message) {
        const config = await readDiscordConfig()
        if (config.guildId && message.guildId !== config.guildId) {
            return false
        }
        return isDiscordActorAuthorized(config, this.actorFromMessage(message))
    }

    async replyUnauthorized(interaction: Interaction<CacheType>) {
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
}
