import { parseStudioSessionTitle } from '../../../shared/session-metadata.js'
import { listStudioChatSessions } from '../chat/session-service.js'
import { listSessionOwnershipsForWorkingDir } from '../chat/session-ownership-service.js'
import { unnamedThreadNameFor } from './sync-plan.js'

export type DiscordStandaloneThreadSummary = {
    id: string
    name: string
    status?: string
    createdAt?: number
    updatedAt?: number
}

export async function listStandaloneThreadsForDiscord(workingDir: string, agentId: string): Promise<DiscordStandaloneThreadSummary[]> {
    const [ownerships, sessions] = await Promise.all([
        listSessionOwnershipsForWorkingDir(workingDir, 'agent'),
        listStudioChatSessions(workingDir).catch(() => null),
    ])
    const sessionsById = sessions ? new Map(sessions.map((session) => [session.id, session])) : null
    const threads = ownerships
        .filter((ownership) => ownership.ownerId === agentId)
        .map((ownership): DiscordStandaloneThreadSummary | null => {
            const session = sessionsById?.get(ownership.sessionId) || null
            if (sessionsById && !session) {
                return null
            }
            const metadataTitle = parseStudioSessionTitle(session?.title)
            const name = ownership.sidebarTitle?.trim()
                || session?.sidebarTitle?.trim()
                || (!metadataTitle ? session?.title?.trim() : undefined)
            return {
                id: ownership.sessionId,
                name: name || '',
                ...(session?.status ? { status: session.status } : {}),
                ...(session?.createdAt ? { createdAt: session.createdAt } : {}),
                updatedAt: session?.updatedAt || ownership.updatedAt,
            }
        })
        .filter((thread): thread is DiscordStandaloneThreadSummary => !!thread)
    return threads
        .map((thread) => ({
            ...thread,
            name: thread.name.trim() || unnamedThreadNameFor(threads, thread.id),
        }))
        .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
}
