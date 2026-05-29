import { Hono } from 'hono'
import type {
    DiscordConfigUpdateRequest,
    DiscordIntegrationStatus,
    DiscordSyncRequest,
    DiscordSyncResponse,
} from '../../../shared/discord-contracts.js'
import { discordIntegrationService } from '../../services/discord/discord-service.js'
import { jsonError } from '../route-errors.js'

const discord = new Hono()

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

discord.get('/api/discord/status', async (c) => {
    try {
        const response = await discordIntegrationService.getStatus()
        return c.json(response satisfies DiscordIntegrationStatus)
    } catch (error) {
        return jsonError(c, errorMessage(error), 500)
    }
})

discord.put('/api/discord/config', async (c) => {
    try {
        const body = await c.req.json<DiscordConfigUpdateRequest>().catch(() => ({}))
        const response = await discordIntegrationService.updateConfig(body)
        return c.json(response satisfies DiscordIntegrationStatus)
    } catch (error) {
        return jsonError(c, errorMessage(error), 400)
    }
})

discord.post('/api/discord/disconnect', async (c) => {
    try {
        const response = await discordIntegrationService.disconnect()
        return c.json(response satisfies DiscordIntegrationStatus)
    } catch (error) {
        return jsonError(c, errorMessage(error), 500)
    }
})

discord.post('/api/discord/sync', async (c) => {
    try {
        const body = await c.req.json<DiscordSyncRequest>().catch((): DiscordSyncRequest => ({}))
        if (body.workspaceId?.trim()) {
            const response = await discordIntegrationService.syncWorkspace(body.workspaceId.trim())
            return c.json(response satisfies DiscordSyncResponse)
        }
        const response = await discordIntegrationService.syncAllWorkspaces()
        return c.json(response satisfies DiscordSyncResponse)
    } catch (error) {
        return jsonError(c, errorMessage(error), 400)
    }
})

export default discord
