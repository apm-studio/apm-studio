import type { ChatMessage } from '../store/session/chat-message-types'

export function mergeSystemPrefixMessages(
    prefixes: ChatMessage[] | undefined,
    messages: ChatMessage[],
): ChatMessage[] {
    if (!prefixes?.length) {
        return messages
    }

    const serverIds = new Set(messages.map((message) => message.id))
    const systemPrefixes = prefixes.filter(
        (prefix) => prefix.role === 'system' && !serverIds.has(prefix.id),
    )

    if (systemPrefixes.length === 0) {
        return messages
    }

    return [...systemPrefixes, ...messages]
}

const OPTIMISTIC_USER_MIRROR_WINDOW_MS = 30_000

function buildAttachmentSignature(message: ChatMessage): string {
    return (message.attachments || [])
        .map((attachment) => `${attachment.type}:${attachment.filename || ''}:${attachment.mime || ''}`)
        .join('|')
}

function isOptimisticUserMessage(message: ChatMessage): boolean {
    return message.role === 'user' && message.id.startsWith('temp-')
}

function isPersistedUserMessage(message: ChatMessage): boolean {
    return message.role === 'user' && !message.id.startsWith('temp-')
}

function hasMatchingServerUserMessage(serverMessages: ChatMessage[], optimisticMessage: ChatMessage): boolean {
    const optimisticAttachmentSignature = buildAttachmentSignature(optimisticMessage)
    return serverMessages.some((message) => (
        isPersistedUserMessage(message)
        && message.content === optimisticMessage.content
        && buildAttachmentSignature(message) === optimisticAttachmentSignature
        && Math.abs(message.timestamp - optimisticMessage.timestamp) < OPTIMISTIC_USER_MIRROR_WINDOW_MS
    ))
}

export function mergePendingOptimisticUserMessages(
    serverMessages: ChatMessage[],
    currentMessages: ChatMessage[],
    keepPendingOptimisticMessages: boolean,
): ChatMessage[] {
    if (!keepPendingOptimisticMessages || currentMessages.length === 0) {
        return serverMessages
    }

    const optimisticMessages = currentMessages.filter(isOptimisticUserMessage)
    if (optimisticMessages.length === 0) {
        return serverMessages
    }

    const merged = [...serverMessages]
    for (const optimisticMessage of optimisticMessages) {
        if (!hasMatchingServerUserMessage(serverMessages, optimisticMessage)) {
            merged.push(optimisticMessage)
        }
    }

    return merged.sort((left, right) => left.timestamp - right.timestamp)
}

function isLiveAssistantLikeMessage(message: ChatMessage) {
    return (
        (message.role === 'assistant' || message.role === 'system')
        && !message.id.startsWith('temp-')
    )
}

function chooseLongerString(left: string | undefined, right: string | undefined) {
    return (right || '').length > (left || '').length ? right : left
}

function mergeToolMetadata(
    serverMetadata: Record<string, unknown> | undefined,
    currentMetadata: Record<string, unknown> | undefined,
) {
    if (!serverMetadata) {
        return currentMetadata
    }
    if (!currentMetadata) {
        return serverMetadata
    }
    return {
        ...serverMetadata,
        ...currentMetadata,
    }
}

function mergeMessageMetadata(
    serverMetadata: ChatMessage['metadata'],
    currentMetadata: ChatMessage['metadata'],
): ChatMessage['metadata'] | undefined {
    if (!serverMetadata) {
        return currentMetadata
    }
    if (!currentMetadata) {
        return serverMetadata
    }
    return {
        agentName: serverMetadata.agentName || currentMetadata.agentName,
        provider: serverMetadata.provider || currentMetadata.provider,
        modelId: serverMetadata.modelId || currentMetadata.modelId,
        variant: serverMetadata.variant || currentMetadata.variant,
        isWakeUp: serverMetadata.isWakeUp || currentMetadata.isWakeUp,
    }
}

function mergeAssistantLikeParts(
    serverParts: ChatMessage['parts'],
    currentParts: ChatMessage['parts'],
): ChatMessage['parts'] {
    if (!serverParts?.length) {
        return currentParts?.length ? currentParts : undefined
    }
    if (!currentParts?.length) {
        return serverParts
    }

    const currentById = new Map(currentParts.map((part) => [part.id, part]))
    const merged = serverParts.map((serverPart) => {
        const currentPart = currentById.get(serverPart.id)
        if (!currentPart || currentPart.type !== serverPart.type) {
            return serverPart
        }

        if ((serverPart.type === 'text' || serverPart.type === 'reasoning')) {
            return {
                ...serverPart,
                content: chooseLongerString(serverPart.content, currentPart.content) || '',
            }
        }

        if (serverPart.type === 'tool' && serverPart.tool && currentPart.tool) {
            const statusRank = { pending: 0, running: 1, completed: 2, error: 2 } as const
            const preferredTool = statusRank[currentPart.tool.status] > statusRank[serverPart.tool.status]
                ? currentPart.tool
                : serverPart.tool

            return {
                ...serverPart,
                tool: {
                    ...preferredTool,
                    title: chooseLongerString(serverPart.tool.title, currentPart.tool.title),
                    output: chooseLongerString(serverPart.tool.output, currentPart.tool.output),
                    error: chooseLongerString(serverPart.tool.error, currentPart.tool.error),
                    input: currentPart.tool.input || serverPart.tool.input,
                    metadata: mergeToolMetadata(serverPart.tool.metadata, currentPart.tool.metadata),
                    time: currentPart.tool.time || serverPart.tool.time,
                },
            }
        }

        return currentPart
    })

    for (const currentPart of currentParts) {
        if (!merged.some((part) => part.id === currentPart.id)) {
            merged.push(currentPart)
        }
    }

    return merged
}

function mergeInFlightAssistantLikeMessage(serverMessage: ChatMessage, currentMessage: ChatMessage): ChatMessage {
    return {
        ...serverMessage,
        content: chooseLongerString(serverMessage.content, currentMessage.content) || '',
        parts: mergeAssistantLikeParts(serverMessage.parts, currentMessage.parts),
        metadata: mergeMessageMetadata(serverMessage.metadata, currentMessage.metadata),
    }
}

function mergeInFlightAssistantMessages(
    serverMessages: ChatMessage[],
    currentMessages: ChatMessage[],
    keepLiveAssistantMessages: boolean,
): ChatMessage[] {
    if (!keepLiveAssistantMessages || currentMessages.length === 0) {
        return serverMessages
    }

    const currentById = new Map(currentMessages.map((message) => [message.id, message]))
    const merged = serverMessages.map((serverMessage) => {
        const currentMessage = currentById.get(serverMessage.id)
        if (!currentMessage) {
            return serverMessage
        }
        if (!isLiveAssistantLikeMessage(serverMessage) || !isLiveAssistantLikeMessage(currentMessage)) {
            return serverMessage
        }
        return mergeInFlightAssistantLikeMessage(serverMessage, currentMessage)
    })

    for (const currentMessage of currentMessages) {
        if (!isLiveAssistantLikeMessage(currentMessage)) {
            continue
        }
        if (!merged.some((message) => message.id === currentMessage.id)) {
            merged.push(currentMessage)
        }
    }

    return merged.sort((left, right) => left.timestamp - right.timestamp)
}

export function mergeLiveSessionSnapshot(
    serverMessages: ChatMessage[],
    currentMessages: ChatMessage[],
    options: {
        preserveOptimisticUserMessages: boolean
        preserveStreamingAssistantMessages: boolean
    },
): ChatMessage[] {
    const withOptimisticUsers = mergePendingOptimisticUserMessages(
        serverMessages,
        currentMessages,
        options.preserveOptimisticUserMessages,
    )

    return mergeInFlightAssistantMessages(
        withOptimisticUsers,
        currentMessages,
        options.preserveStreamingAssistantMessages,
    )
}
