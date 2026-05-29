import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    fetchApiResponse,
    setApiWorkingDirContext,
} from './api-core'
import { isStudioApiNotFoundError, StudioApiError } from './lib/api-errors'

describe('api core transport errors', () => {
    afterEach(() => {
        setApiWorkingDirContext(null)
        vi.unstubAllGlobals()
    })

    it('normalizes failed API responses to the shared error payload shape', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'Canonical failure',
            detail: 'Full detail',
            code: 'validation',
            action: 'retry',
            retryable: true,
            status: 422,
            providerId: 'openai',
            modelId: 'gpt-5',
            ignoredField: 'do not leak',
        }), {
            status: 422,
            statusText: 'Unprocessable Entity',
        })))

        await expect(fetchApiResponse('/api/fail')).rejects.toMatchObject({
            message: 'Canonical failure',
            detail: 'Full detail',
            code: 'validation',
            action: 'retry',
            retryable: true,
            status: 422,
            providerId: 'openai',
            modelId: 'gpt-5',
        })
    })

    it('ignores invalid API error fields from malformed responses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'Bad request',
            code: 'invalid_code',
            action: 'open_portal',
            retryable: 'yes',
            status: 418,
            providerId: 12,
            modelId: 'gpt-5',
        }), {
            status: 400,
            statusText: 'Bad Request',
        })))

        try {
            await fetchApiResponse('/api/fail')
            throw new Error('Expected fetchApiResponse to reject')
        } catch (error) {
            expect(error).toBeInstanceOf(StudioApiError)
            const apiError = error as StudioApiError
            expect(apiError.message).toBe('Bad request')
            expect(apiError.status).toBe(400)
            expect(apiError.code).toBeUndefined()
            expect(apiError.action).toBeUndefined()
            expect(apiError.retryable).toBeUndefined()
            expect(apiError.providerId).toBeUndefined()
            expect(apiError.modelId).toBe('gpt-5')
        }
    })

    it('checks not-found API errors through the shared helper', () => {
        expect(isStudioApiNotFoundError(new StudioApiError({ error: 'missing' }, 404))).toBe(true)
        expect(isStudioApiNotFoundError(new Error('plain failure'))).toBe(false)
    })
})
