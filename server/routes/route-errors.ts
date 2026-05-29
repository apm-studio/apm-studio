import type { Context } from 'hono'
import type { ApiErrorResponse, ApiErrorStatus, ApiServiceFailure } from '../../shared/api-contracts.js'
import { resolveRequestWorkingDir } from '../lib/request-context.js'

export function jsonError(
    c: Context,
    message: string,
    status: ApiErrorStatus = 400,
) {
    const response: ApiErrorResponse = { error: message }
    return c.json(response, { status })
}

export function requestWorkingDir(c: Context): string {
    return resolveRequestWorkingDir(c)
}

export function jsonServiceFailure(
    c: Context,
    result: ApiServiceFailure,
) {
    const response: ApiErrorResponse = { ...result }
    delete (response as ApiErrorResponse & { ok?: false }).ok
    delete response.status
    return c.json(response satisfies ApiErrorResponse, { status: result.status })
}
