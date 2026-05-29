import type {
    AssistantAction,
    AssistantActionEnvelope,
} from './assistant-actions.js'
import {
    normalizeAssistantActionCandidate,
    normalizeAssistantActionEnvelopeCandidate,
} from './assistant-action-normalizers.js'
import { isValidAssistantAction } from './assistant-action-validators.js'

export { lintAssistantActionEnvelope, type AssistantActionLintIssue } from './assistant-action-lint.js'

export function parseAssistantActionEnvelope(input: unknown): AssistantActionEnvelope | null {
    const candidate = normalizeAssistantActionEnvelopeCandidate(input)
    if (!candidate) {
        return null
    }

    if (candidate.version !== 1 || !Array.isArray(candidate.actions)) {
        return null
    }

    const normalizedActions = candidate.actions.map((action) => normalizeAssistantActionCandidate(action))

    if (!normalizedActions.every((action) => isValidAssistantAction(action))) {
        return null
    }
    return {
        version: 1,
        actions: normalizedActions as AssistantAction[],
    }
}
