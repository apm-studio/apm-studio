import type { ChatMessage, ChatMessagePart, ChatMessageToolInfo } from './chat-message-types'
import { formatToolError } from './event-message-parts'

export function upsertMessageEnvelope(
    messages: ChatMessage[],
    messageId: string,
    role: ChatMessage['role'],
    timestamp: number,
): ChatMessage[] {
    const next = [...messages]
    const existingIndex = next.findIndex((message) => message.id === messageId)
    if (existingIndex >= 0) {
        next[existingIndex] = {
            ...next[existingIndex],
            role,
            timestamp,
        }
        return next
    }

    if (role === 'user') {
        const tempIndex = findLatestTempUserMessageIndex(next)
        if (tempIndex >= 0) {
            next[tempIndex] = {
                ...next[tempIndex],
                id: messageId,
                role,
                timestamp,
            }
            return next
        }
    }

    next.push({
        id: messageId,
        role,
        content: '',
        timestamp,
    })
    return next
}

export function upsertMessagePart(messages: ChatMessage[], messageId: string, part: ChatMessagePart): ChatMessage[] {
    const next = [...messages]
    const idx = next.findIndex((m) => m.id === messageId)
    if (idx === -1) {
        const created: ChatMessage = {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            parts: [part],
        }
        next.push(applyMessageParts(created, [part], { preserveContentWithoutTextParts: false }))
        return next
    }

    const message = next[idx]
    const existingParts = message.parts ? [...message.parts] : []
    const partIdx = existingParts.findIndex((p) => p.id === part.id)
    if (partIdx === -1) {
        existingParts.push(part)
    } else {
        existingParts[partIdx] = part
    }
    next[idx] = applyMessageParts(message, existingParts, {
        preserveContentWithoutTextParts: part.type !== 'text' && !hasTextParts(message.parts || []),
    })
    return next
}

export function applyMessagePartDelta(
    messages: ChatMessage[],
    messageId: string,
    partId: string,
    field: string,
    delta: string,
): ChatMessage[] | null {
    const existingMsg = messages.find((m) => m.id === messageId)
    const existingPart = existingMsg?.parts?.find((p) => p.id === partId)

    if (existingPart?.type === 'reasoning') {
        return upsertMessagePart(messages, messageId, {
            ...existingPart,
            content: (existingPart.content || '') + delta,
        })
    }

    if (existingPart?.type === 'tool' && existingPart.tool) {
        const nextTool = buildToolDelta(existingPart.tool, field, delta)
        if (!nextTool) return null

        return upsertMessagePart(messages, messageId, {
            ...existingPart,
            tool: nextTool,
        })
    }

    const existingTextContent = existingPart?.type === 'text'
        ? existingPart.content || ''
        : (
            existingMsg && !(existingMsg.parts || []).some((part) => part.type === 'text')
                ? existingMsg.content || ''
                : ''
        )
    return upsertMessagePart(messages, messageId, {
        id: partId,
        type: 'text',
        content: existingTextContent + delta,
    })
}

export function removeMessagePartFromMessages(messages: ChatMessage[], messageId: string, partId: string): ChatMessage[] {
    const next = [...messages]
    const idx = next.findIndex((m) => m.id === messageId)
    if (idx === -1) return next

    const message = next[idx]
    if (!message.parts?.length) return next

    const removedPart = message.parts.find((part) => part.id === partId)
    const nextParts = message.parts.filter((p) => p.id !== partId)
    next[idx] = applyMessageParts(message, nextParts, {
        preserveContentWithoutTextParts: removedPart?.type !== 'text',
    })
    return next
}

export function patchToolCallStatusByCallId(
    messages: ChatMessage[],
    callId: string,
    patch: Partial<ChatMessageToolInfo>,
): { messages: ChatMessage[]; changed: boolean } {
    let changed = false
    const nextMessages = messages.map((message) => {
        if (!message.parts?.length) return message

        let messageChanged = false
        const nextParts = message.parts.map((part) => {
            if (part.type !== 'tool' || !part.tool || part.tool.callId !== callId) {
                return part
            }
            messageChanged = true
            changed = true
            return {
                ...part,
                tool: {
                    ...part.tool,
                    ...patch,
                    error: patch.error !== undefined ? formatToolError(patch.error) : part.tool.error,
                    metadata: patch.metadata !== undefined
                        ? {
                            ...(part.tool.metadata || {}),
                            ...patch.metadata,
                        }
                        : part.tool.metadata,
                },
            }
        })

        return messageChanged ? { ...message, parts: nextParts } : message
    })

    return { messages: nextMessages, changed }
}

export function finalizeStaleToolPartsAsError(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((msg) => {
        if (!msg.parts) return msg
        const hasStale = msg.parts.some(
            (p) => p.type === 'tool' && p.tool && (p.tool.status === 'running' || p.tool.status === 'pending'),
        )
        if (!hasStale) return msg
        return {
            ...msg,
            parts: msg.parts.map((p) =>
                p.type === 'tool' && p.tool && (p.tool.status === 'running' || p.tool.status === 'pending')
                    ? { ...p, tool: { ...p.tool, status: 'error' as const } }
                    : p,
            ),
        }
    })
}

function buildToolDelta(
    tool: ChatMessageToolInfo,
    field: string,
    delta: string,
): ChatMessageToolInfo | null {
    const currentMetadata = tool.metadata || {}
    const appendMetadataValue = (key: string) => {
        const existingValue = currentMetadata[key]
        return typeof existingValue === 'string' ? existingValue + delta : delta
    }

    let nextOutput = tool.output
    let nextMetadata: Record<string, unknown> | undefined = currentMetadata

    if (field === 'output' || field === 'state.output') {
        nextOutput = (tool.output || '') + delta
    } else if (field === 'stdout' || field === 'state.stdout') {
        nextMetadata = {
            ...currentMetadata,
            stdout: appendMetadataValue('stdout'),
        }
    } else if (field === 'stderr' || field === 'state.stderr') {
        nextMetadata = {
            ...currentMetadata,
            stderr: appendMetadataValue('stderr'),
        }
    } else if (field === 'metadata.output' || field === 'state.metadata.output') {
        nextMetadata = {
            ...currentMetadata,
            output: appendMetadataValue('output'),
        }
    } else {
        return null
    }

    return {
        ...tool,
        output: nextOutput,
        metadata: nextMetadata,
    }
}

function hasTextParts(parts: ChatMessagePart[]) {
    return parts.some((part) => part.type === 'text')
}

function buildContentFromTextParts(parts: ChatMessagePart[]) {
    return parts
        .filter((part) => part.type === 'text')
        .map((part) => part.content || '')
        .join('\n')
}

function applyMessageParts(
    message: ChatMessage,
    parts: ChatMessagePart[],
    options: { preserveContentWithoutTextParts: boolean },
): ChatMessage {
    if (hasTextParts(parts)) {
        return {
            ...message,
            parts,
            content: buildContentFromTextParts(parts),
        }
    }

    return {
        ...message,
        parts,
        content: options.preserveContentWithoutTextParts ? message.content : '',
    }
}

function findLatestTempUserMessageIndex(messages: ChatMessage[]): number {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index]
        if (message.role === 'user' && message.id.startsWith('temp-')) {
            return index
        }
    }
    return -1
}
