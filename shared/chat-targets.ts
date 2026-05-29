export const ASSISTANT_CHAT_OWNER_ID = 'studio-assistant'

export type ChatTargetDescriptor =
    | {
        kind: 'agent'
        chatKey: string
        agentId: string
    }
    | {
        kind: 'assistant'
        chatKey: string
    }
    | {
        kind: 'team-participant'
        chatKey: string
        teamId: string
        threadId: string
        participantKey: string
    }

export function buildTeamParticipantChatKey(teamId: string, threadId: string, participantKey: string) {
    return `team:${teamId}:thread:${threadId}:participant:${participantKey}`
}

export function parseTeamParticipantChatKey(chatKey: string) {
    const match = chatKey.match(/^team:([^:]+):thread:([^:]+):participant:(.+)$/)
    if (!match) {
        return null
    }

    const [, teamId, threadId, participantKey] = match
    return {
        teamId,
        threadId,
        participantKey,
    }
}

export function isTeamParticipantChatKey(chatKey: string) {
    return parseTeamParticipantChatKey(chatKey) !== null
}

export function hashWorkspaceKey(input: string) {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
}

export function buildAssistantChatKey(workingDir: string | null | undefined) {
    const normalized = workingDir?.trim()
    if (!normalized) {
        return ASSISTANT_CHAT_OWNER_ID
    }
    return `${ASSISTANT_CHAT_OWNER_ID}--${hashWorkspaceKey(normalized)}`
}

export function isAssistantChatKey(chatKey: string) {
    return chatKey === ASSISTANT_CHAT_OWNER_ID || chatKey.startsWith(`${ASSISTANT_CHAT_OWNER_ID}--`)
}

export function describeChatTarget(chatKey: string): ChatTargetDescriptor {
    if (isAssistantChatKey(chatKey)) {
        return {
            kind: 'assistant',
            chatKey,
        }
    }

    const teamParticipant = parseTeamParticipantChatKey(chatKey)
    if (teamParticipant) {
        return {
            kind: 'team-participant',
            chatKey,
            ...teamParticipant,
        }
    }

    return {
        kind: 'agent',
        chatKey,
        agentId: chatKey,
    }
}
