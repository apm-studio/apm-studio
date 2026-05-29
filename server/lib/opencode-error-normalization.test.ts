import { describe, expect, it } from 'vitest'

import {
    isOpencodeAgentNotFoundError,
    normalizeOpencodeError,
    StudioValidationError,
} from './opencode-error-normalization.js'

describe('opencode error normalization boundary', () => {
    it('maps Studio validation errors without retry metadata leakage', () => {
        expect(normalizeOpencodeError(new StudioValidationError(
            'Select another model.',
            'choose_model',
            422,
        ))).toMatchObject({
            error: 'Select another model.',
            detail: 'Select another model.',
            code: 'validation',
            action: 'choose_model',
            retryable: false,
            status: 422,
        })
    })

    it('attaches provider and model context to provider auth failures', () => {
        expect(normalizeOpencodeError(
            { name: 'ProviderAuthError', message: 'token expired' },
            { providerId: 'openai', model: { provider: 'openai', modelId: 'gpt-5' } },
        )).toMatchObject({
            code: 'provider_auth',
            action: 'reconnect_provider',
            retryable: false,
            status: 401,
            providerId: 'openai',
            modelId: 'gpt-5',
        })
    })

    it('maps model availability failures to choose-model guidance', () => {
        expect(normalizeOpencodeError(
            { status: 404, message: 'provider/model does not exist' },
            { model: { provider: 'anthropic', modelId: 'claude-missing' } },
        )).toMatchObject({
            code: 'model_unavailable',
            action: 'choose_model',
            retryable: false,
            status: 404,
            providerId: 'anthropic',
            modelId: 'claude-missing',
        })
    })

    it('detects OpenCode agent-not-found errors for matching agent names only', () => {
        const error = { message: 'Agent not found: "planner"' }

        expect(isOpencodeAgentNotFoundError(error)).toBe(true)
        expect(isOpencodeAgentNotFoundError(error, 'planner')).toBe(true)
        expect(isOpencodeAgentNotFoundError(error, 'reviewer')).toBe(false)
    })
})
