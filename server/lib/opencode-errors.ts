import type { Context } from 'hono'
import {
    normalizeOpencodeError,
    type NormalizeErrorContext,
} from './opencode-error-normalization.js'

export {
    isOpencodeAgentNotFoundError,
    normalizeOpencodeError,
    StudioValidationError,
    type NormalizeErrorContext,
    type StudioOpencodeErrorPayload,
} from './opencode-error-normalization.js'

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

export function jsonOpencodeError(
    c: Context,
    err: unknown,
    context: NormalizeErrorContext = {},
) {
    const payload = normalizeOpencodeError(err, context)
    return c.json(payload, { status: payload.status })
}

export function unwrapOpencodeResult<T>(result: unknown): T {
    const value = asRecord(result)
    if (value && 'error' in value && value.error) {
        throw value.error
    }
    if (value && 'data' in value) {
        return value.data as T
    }
    return result as T
}

export function unwrapPromptResult<T extends { info?: { error?: unknown } }>(result: unknown): T {
    const data = unwrapOpencodeResult<T>(result)
    if (data?.info?.error) {
        throw data.info.error
    }
    return data
}
