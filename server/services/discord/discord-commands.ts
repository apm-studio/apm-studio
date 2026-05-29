import { SlashCommandBuilder } from 'discord.js'
import { MAX_DISCORD_PROMPT_CHARS } from './discord-service-helpers.js'

export function buildDiscordApplicationCommands() {
    return [
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
}
