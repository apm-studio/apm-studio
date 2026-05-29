import type { ChatSendRequest } from '../../../shared/chat-contracts.js'
import type { ModelCapabilities } from '../../../shared/model-types.js'
import { StudioValidationError } from '../../lib/opencode-errors.js'
import { buildTextPromptParts } from './turn-prompt-service.js'

export type ChatPromptPart =
    | { type: 'text'; text: string }
    | { type: 'file'; mime: string; url: string; filename?: string }

export function buildChatPromptParts(
    request: ChatSendRequest,
    capabilitySnapshot: ModelCapabilities | null,
): ChatPromptPart[] {
    const parts: ChatPromptPart[] = buildTextPromptParts(request.message)

    if (!request.attachments || request.attachments.length === 0) {
        return parts
    }

    if (capabilitySnapshot && !capabilitySnapshot.attachment) {
        throw new StudioValidationError(
            'Selected model does not support attachments. Remove the files or choose a model that supports them.',
            'choose_model',
        )
    }

    for (const attachment of request.attachments) {
        parts.push({
            type: 'file',
            mime: attachment.mime,
            url: attachment.url,
            filename: attachment.filename,
        })
    }

    return parts
}
