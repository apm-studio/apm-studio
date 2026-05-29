import type {
    ApiErrorResponse,
    ApiErrorStatus,
    StudioApiErrorAction,
    StudioApiErrorCode,
} from '../../shared/api-contracts.js'
import { isApiErrorStatus } from '../../shared/api-contracts.js'
import type { ModelSelection } from '../../shared/model-types.js'
import {
    isContextOverflowError,
    isModelUnavailableError,
    isProviderAuthError,
    isRuntimeInterruptMessage,
    isRuntimeUnavailableError,
    isSdkContractError,
    isSessionNotFoundError,
    isStructuredOutputError,
} from './opencode-error-classifiers.js'
import {
    extractMessage,
    extractStatus,
    readPath,
    readString,
} from './opencode-error-readers.js'

export type StudioOpencodeErrorPayload = ApiErrorResponse & {
    detail: string
    code: StudioApiErrorCode
    action: StudioApiErrorAction
    retryable: boolean
    status: ApiErrorStatus
}

export type NormalizeErrorContext = {
    providerId?: string | null
    model?: ModelSelection
    defaultStatus?: ApiErrorStatus
}

export class StudioValidationError extends Error {
    readonly action: StudioApiErrorAction
    readonly status: ApiErrorStatus

    constructor(
        message: string,
        action: StudioApiErrorAction = 'fix_input',
        status: ApiErrorStatus = 400,
    ) {
        super(message)
        this.name = 'StudioValidationError'
        this.action = action
        this.status = status
    }
}

export function isOpencodeAgentNotFoundError(err: unknown, agentName?: string | null): boolean {
    const message = extractMessage(err)
    if (!/Agent not found:/i.test(message)) {
        return false
    }
    if (!agentName?.trim()) {
        return true
    }
    return message.includes(`"${agentName}"`) || message.includes(`'${agentName}'`) || message.includes(agentName)
}

function extractProviderId(err: unknown, context: NormalizeErrorContext): string | undefined {
    return context.providerId?.trim()
        || readString(err, 'data', 'providerID')
        || readString(err, 'providerId')
        || context.model?.provider
        || undefined
}

function studioStatus(candidate: number | undefined, fallback: ApiErrorStatus): ApiErrorStatus {
    if (isApiErrorStatus(candidate)) {
        return candidate
    }
    if (candidate === 502 || candidate === 504) {
        return 503
    }
    return fallback
}

export function normalizeOpencodeError(
    err: unknown,
    context: NormalizeErrorContext = {},
): StudioOpencodeErrorPayload {
    if (err instanceof StudioValidationError) {
        return {
            error: err.message,
            detail: err.message,
            code: 'validation',
            action: err.action,
            retryable: false,
            status: studioStatus(err.status, 400),
        }
    }

    const name = typeof readString(err, 'name') === 'string'
        ? readString(err, 'name')!
        : typeof readString(err, 'error', 'name') === 'string'
            ? readString(err, 'error', 'name')!
            : 'UnknownError'
    const detail = extractMessage(err)
    const status = extractStatus(err)
    const providerId = extractProviderId(err, context)
    const modelId = context.model?.modelId
    const retryable = readPath(err, 'data', 'isRetryable') === true || (!!status && status >= 500)

    if (isProviderAuthError(name, detail, status)) {
        return {
            error: `Provider authentication is missing or expired${providerId ? ` for ${providerId}` : ''}. Reconnect it in Settings and try again.`,
            detail,
            code: 'provider_auth',
            action: 'reconnect_provider',
            retryable: false,
            status: studioStatus(status, 401),
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isModelUnavailableError(detail)) {
        return {
            error: `The selected model${modelId ? ` (${modelId})` : ''} is unavailable. Choose another model for this agent and try again.`,
            detail,
            code: 'model_unavailable',
            action: 'choose_model',
            retryable: false,
            status: studioStatus(status, 404),
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isContextOverflowError(name, detail)) {
        return {
            error: 'The current context is too large for the selected model. Reduce context, switch variants, or choose a model with a larger window.',
            detail,
            code: 'context_overflow',
            action: 'reduce_context',
            retryable: false,
            status: studioStatus(status, 400),
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isSessionNotFoundError(detail)) {
        return {
            error: detail,
            detail,
            code: 'validation',
            action: 'refresh_studio',
            retryable: false,
            status: 404,
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isStructuredOutputError(name, detail)) {
        return {
            error: 'OpenCode could not satisfy the required structured output format. Retry, simplify the task, or adjust the current team node.',
            detail,
            code: 'structured_output',
            action: 'retry',
            retryable: true,
            status: studioStatus(status, 422),
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isRuntimeUnavailableError(detail, status)) {
        return {
            error: isRuntimeInterruptMessage(detail)
                ? 'OpenCode interrupted the current run unexpectedly. Retry in a moment, and if it keeps happening restart OpenCode from Settings.'
                : 'OpenCode is unavailable right now. Retry in a moment or restart OpenCode from Settings.',
            detail,
            code: 'runtime_unavailable',
            action: 'restart_opencode',
            retryable: true,
            status: studioStatus(status, 503),
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    if (isSdkContractError(detail, status)) {
        return {
            error: 'Studio could not complete this request because the OpenCode API contract looks incompatible. Refresh Studio or restart OpenCode.',
            detail,
            code: 'sdk_contract',
            action: 'refresh_studio',
            retryable: false,
            status: studioStatus(status, 500),
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
        }
    }

    return {
        error: detail,
        detail,
        code: 'unknown',
        action: retryable ? 'retry' : 'fix_input',
        retryable,
        status: studioStatus(status, context.defaultStatus || 500),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
    }
}
