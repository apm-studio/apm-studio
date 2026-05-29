import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} from 'discord.js'
import type { DiscordWorkspaceSnapshot } from './studio-runtime.js'
import { workspaceLabel } from './discord-service-helpers.js'

export function buildWorkspaceMenuComponents(
    workspaceId: string,
    snapshot: DiscordWorkspaceSnapshot,
    savedWorkspaces: Array<{ id: string; workingDir: string }>,
) {
    const rows: Array<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>> = []
    if (savedWorkspaces.length > 0) {
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`apm:workspace:${workspaceId}`)
                .setPlaceholder('Switch workspace')
                .addOptions(savedWorkspaces.slice(0, 25).map((workspace) => ({
                    label: workspaceLabel(workspace.workingDir).slice(0, 100),
                    value: workspace.id,
                    description: workspace.workingDir.slice(0, 100),
                    default: workspace.id === workspaceId,
                }))),
        ))
    }
    const agents = (snapshot.agents || []).slice(0, 25)
    if (agents.length > 0) {
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`apm:agent:${workspaceId}`)
                .setPlaceholder('Open agent threads')
                .addOptions(agents.map((agent) => ({
                    label: agent.name.slice(0, 100),
                    value: agent.id,
                    description: agent.model ? `${agent.model.provider}/${agent.model.modelId}`.slice(0, 100) : 'No model selected',
                }))),
        ))
    }

    const teams = (snapshot.teams || []).slice(0, 25)
    if (teams.length > 0) {
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`apm:team:${workspaceId}`)
                .setPlaceholder('Open Team threads')
                .addOptions(teams.map((team) => ({
                    label: team.name.slice(0, 100),
                    value: team.id,
                    description: `${Object.keys(team.participants || {}).length} participants, ${team.relations?.length || 0} relations`.slice(0, 100),
                }))),
        ))
    }

    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`apm:sync:${workspaceId}`)
            .setLabel('Sync workspace')
            .setStyle(ButtonStyle.Secondary),
    ))
    return rows.slice(0, 5)
}
