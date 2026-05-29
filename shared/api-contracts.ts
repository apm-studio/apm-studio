export const STUDIO_API_ERROR_CODES = [
    'validation',
    'provider_auth',
    'model_unavailable',
    'context_overflow',
    'structured_output',
    'runtime_unavailable',
    'sdk_contract',
    'unknown',
] as const

export type StudioApiErrorCode = typeof STUDIO_API_ERROR_CODES[number]

export const STUDIO_API_ERROR_ACTIONS = [
    'fix_input',
    'select_model',
    'choose_model',
    'reduce_context',
    'reconnect_provider',
    'restart_opencode',
    'refresh_studio',
    'retry',
] as const

export type StudioApiErrorAction = typeof STUDIO_API_ERROR_ACTIONS[number]

export const API_ERROR_STATUSES = [400, 401, 403, 404, 409, 422, 429, 500, 501, 503] as const

export type ApiErrorStatus = typeof API_ERROR_STATUSES[number]

export interface ApiErrorResponse {
    error: string
    detail?: string
    code?: StudioApiErrorCode
    action?: StudioApiErrorAction
    retryable?: boolean
    status?: ApiErrorStatus
    providerId?: string
    modelId?: string
}

export type StudioApiErrorPayload = ApiErrorResponse

export interface ApiServiceFailure extends ApiErrorResponse {
    ok: false
    status: ApiErrorStatus
}

export function isStudioApiErrorCode(value: unknown): value is StudioApiErrorCode {
    return typeof value === 'string' && (STUDIO_API_ERROR_CODES as readonly string[]).includes(value)
}

export function isStudioApiErrorAction(value: unknown): value is StudioApiErrorAction {
    return typeof value === 'string' && (STUDIO_API_ERROR_ACTIONS as readonly string[]).includes(value)
}

export function isApiErrorStatus(value: unknown): value is ApiErrorStatus {
    return typeof value === 'number' && (API_ERROR_STATUSES as readonly number[]).includes(value)
}
