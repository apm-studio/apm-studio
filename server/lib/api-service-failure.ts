import type { ApiErrorStatus, ApiServiceFailure } from '../../shared/api-contracts.js'

type ApiServiceFailureOptions = Omit<ApiServiceFailure, 'ok' | 'status' | 'error'>

export function apiServiceFailure(
    status: ApiErrorStatus,
    error: string,
    options: ApiServiceFailureOptions = {},
): ApiServiceFailure {
    return {
        ok: false,
        status,
        error,
        ...options,
    }
}
