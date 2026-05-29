export function readPath(value: unknown, ...keys: string[]): unknown {
    let current: unknown = value
    for (const key of keys) {
        const record = current && typeof current === 'object'
            ? current as Record<string, unknown>
            : undefined
        if (!record) {
            return undefined
        }
        current = record[key]
    }
    return current
}

export function readString(value: unknown, ...keys: string[]): string | undefined {
    const candidate = readPath(value, ...keys)
    return typeof candidate === 'string' ? candidate : undefined
}

function readNumber(value: unknown, ...keys: string[]): number | undefined {
    const candidate = readPath(value, ...keys)
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined
}

export function extractStatus(err: unknown): number | undefined {
    const candidates = [
        readNumber(err, 'status'),
        readNumber(err, 'statusCode'),
        readNumber(err, 'data', 'statusCode'),
        readNumber(err, 'response', 'status'),
        readNumber(err, 'cause', 'status'),
        readNumber(err, 'cause', 'statusCode'),
        readNumber(err, 'cause', 'response', 'status'),
    ]

    for (const candidate of candidates) {
        if (candidate !== undefined) {
            return candidate
        }
    }

    return undefined
}

function extractBodyMessage(body: unknown): string | null {
    if (typeof body !== 'string' || !body.trim()) {
        return null
    }

    try {
        const parsed = JSON.parse(body)
        const error = readString(parsed, 'error')
        if (error?.trim()) {
            return error.trim()
        }
        const message = readString(parsed, 'message')
        if (message?.trim()) {
            return message.trim()
        }
    } catch {
        return body.trim()
    }

    return body.trim()
}

function sanitizeMessage(message: string): string {
    const trimmed = message.trim()
    if (!trimmed) {
        return trimmed
    }

    const firstLine = trimmed
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)

    return firstLine || trimmed
}

export function extractMessage(err: unknown): string {
    const message = [
        readString(err, 'data', 'message'),
        readString(err, 'message'),
        readString(err, 'error', 'message'),
        readString(err, 'cause', 'data', 'message'),
        readString(err, 'cause', 'message'),
        extractBodyMessage(readPath(err, 'data', 'responseBody')),
        extractBodyMessage(readPath(err, 'responseBody')),
    ].find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)

    if (message) {
        return sanitizeMessage(message)
    }

    try {
        const raw = JSON.stringify(err, null, 2)
        const truncated = raw.length > 500 ? `${raw.slice(0, 500)}...` : raw
        return `OpenCode request failed. Raw: ${truncated}`
    } catch {
        return 'OpenCode request failed.'
    }
}
