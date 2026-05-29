import {
    Events,
} from 'discord.js'
import type {
    Client,
    Interaction,
    Message,
} from 'discord.js'

export interface DiscordClientEventHandlers {
    handleInteraction: (interaction: Interaction) => Promise<void>
    handleMessage: (message: Message) => Promise<void>
    noteDiscordIssue: (message: string, error?: unknown) => void
    onClientReady: () => void
    onDisconnected: () => void
    onInteractionError: (interaction: Interaction, error: unknown) => Promise<void>
    onMessageError: (message: Message, error: unknown) => Promise<void>
    onReconnecting: () => void
    onShardReady: () => void
}

export function attachDiscordClientEventHandlers(
    client: Client,
    handlers: DiscordClientEventHandlers,
) {
    client.on(Events.ClientReady, () => {
        handlers.onClientReady()
    })
    client.on(Events.Error, (error) => {
        handlers.noteDiscordIssue('Discord client error', error)
    })
    client.on(Events.ShardError, (error, shardId) => {
        handlers.noteDiscordIssue(`Discord shard ${shardId} error`, error)
    })
    client.on(Events.ShardDisconnect, (event, shardId) => {
        const code = typeof event.code === 'number' ? ` code=${event.code}` : ''
        const reason = typeof event.reason === 'string' && event.reason ? ` reason=${event.reason}` : ''
        handlers.onDisconnected()
        handlers.noteDiscordIssue(`Discord shard ${shardId} disconnected${code}${reason}`)
    })
    client.on(Events.ShardReconnecting, (shardId) => {
        handlers.onReconnecting()
        handlers.noteDiscordIssue(`Discord shard ${shardId} reconnecting`)
    })
    client.on(Events.ShardReady, (shardId) => {
        handlers.onShardReady()
        console.info(`[discord] Discord shard ${shardId} ready.`)
    })
    client.on(Events.ShardResume, (shardId, replayedEvents) => {
        handlers.onShardReady()
        console.info(`[discord] Discord shard ${shardId} resumed after replaying ${replayedEvents} event(s).`)
    })
    client.on(Events.InteractionCreate, (interaction) => {
        void handlers.handleInteraction(interaction).catch((error) => {
            void handlers.onInteractionError(interaction, error)
        })
    })
    client.on(Events.MessageCreate, (message) => {
        void handlers.handleMessage(message).catch((error) => {
            void handlers.onMessageError(message, error)
        })
    })
}

export function waitForDiscordClientReady(client: Client, timeoutMs = 15_000) {
    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Discord bot did not become ready in time.')), timeoutMs)
        client.once(Events.ClientReady, () => {
            clearTimeout(timeout)
            resolve()
        })
        client.once(Events.Error, (error) => {
            clearTimeout(timeout)
            reject(error)
        })
    })
}
