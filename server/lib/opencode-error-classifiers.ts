export function isProviderAuthError(name: string, message: string, status?: number) {
    return name === 'ProviderAuthError'
        || status === 401
        || status === 403
        || /\b(unauthorized|forbidden|authentication|auth\b|api key|credentials?|token expired|provider auth)\b/i.test(message)
}

export function isModelUnavailableError(message: string) {
    return /\b(model|provider\/model)\b/i.test(message)
        && /\b(not found|not available|unavailable|unsupported|unknown|invalid|does not exist|missing)\b/i.test(message)
}

export function isRuntimeInterruptMessage(message: string) {
    return /\bAll fibers interrupted without error\b/i.test(message)
}

export function isRuntimeUnavailableError(message: string, status?: number) {
    return status === 502
        || status === 503
        || status === 504
        || isRuntimeInterruptMessage(message)
        || /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|failed to fetch|network error|connection refused|service unavailable|gateway timeout)\b/i.test(message)
}

export function isStructuredOutputError(name: string, message: string) {
    return name === 'StructuredOutputError'
        || /\b(structured output|json schema|output schema|format validation)\b/i.test(message)
}

export function isContextOverflowError(name: string, message: string) {
    return name === 'ContextOverflowError'
        || /\b(context overflow|context window|prompt is too long|too many tokens|maximum context|exceeds context)\b/i.test(message)
}

export function isSdkContractError(message: string, status?: number) {
    return status === 404
        || /\b(no body in sse response|unexpected response|response validation|invalid response|failed to parse|cannot read properties of undefined|not implemented)\b/i.test(message)
}

export function isSessionNotFoundError(message: string) {
    return /\bSession not found:/i.test(message)
}
