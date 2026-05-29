import { randomUUID } from 'crypto'
import type { ChatPermissionRequest, ChatQuestionRequest } from '../../../shared/chat-contracts.js'
import type { DiscordPendingInteraction } from '../../../shared/discord-contracts.js'
import { PENDING_INTERACTION_TTL_MS } from './discord-service-helpers.js'
import { readDiscordMappings, updateDiscordMappings } from './config-store.js'

export type DiscordPendingInteractionKind = 'permission' | 'question'

export interface RegisterDiscordPendingInteractionParams {
    kind: DiscordPendingInteractionKind
    workspaceId: string
    channelId: string
    workingDir: string
    sessionId: string
    request: ChatPermissionRequest | ChatQuestionRequest
}

export class DiscordPendingInteractionStore {
    async register(params: RegisterDiscordPendingInteractionParams) {
        const id = randomUUID().replace(/-/g, '').slice(0, 16)
        await updateDiscordMappings((mappings) => {
            mappings.pendingInteractions ||= {}
            const expiresBefore = Date.now() - PENDING_INTERACTION_TTL_MS
            for (const [pendingId, pending] of Object.entries(mappings.pendingInteractions)) {
                if (typeof pending.createdAt !== 'number' || pending.createdAt < expiresBefore) {
                    delete mappings.pendingInteractions[pendingId]
                }
            }
            mappings.pendingInteractions[id] = {
                kind: params.kind,
                workspaceId: params.workspaceId,
                channelId: params.channelId,
                workingDir: params.workingDir,
                sessionId: params.sessionId,
                request: params.request as unknown as Record<string, unknown>,
                createdAt: Date.now(),
            }
        })
        return id
    }

    async clear(id: string) {
        await updateDiscordMappings((mappings) => {
            if (mappings.pendingInteractions) {
                delete mappings.pendingInteractions[id]
            }
        })
    }

    async require(id: string, channelId: string | null | undefined): Promise<DiscordPendingInteraction> {
        const mappings = await readDiscordMappings()
        const pending = mappings.pendingInteractions?.[id]
        if (!pending) {
            throw new Error('That Studio prompt is no longer pending.')
        }
        if (pending.channelId !== channelId) {
            throw new Error('That Studio prompt belongs to another Discord channel.')
        }
        return pending
    }

    async hasFreshPrompt(params: {
        channelId: string
        sessionId: string
        kind: DiscordPendingInteractionKind
        requestId: string
    }) {
        if (!params.requestId) {
            return false
        }
        const mappings = await readDiscordMappings()
        return Object.values(mappings.pendingInteractions || {}).some((pending) => {
            const pendingRequestId = typeof pending.request.id === 'string' ? pending.request.id : ''
            const createdAt = typeof pending.createdAt === 'number' ? pending.createdAt : 0
            return pending.channelId === params.channelId
                && pending.sessionId === params.sessionId
                && pending.kind === params.kind
                && pendingRequestId === params.requestId
                && Date.now() - createdAt <= PENDING_INTERACTION_TTL_MS
        })
    }
}
