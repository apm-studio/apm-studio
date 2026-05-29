type ResponseEnvelope<T> = { data?: T | null | undefined }

function extractResponseData<T>(response: unknown): T | undefined {
    if (!response || typeof response !== 'object' || !('data' in response)) {
        return undefined
    }
    return (response as ResponseEnvelope<T>).data ?? undefined
}

export function responseData<T>(response: unknown, fallback: T): T {
    const data = extractResponseData<T>(response)
    return data === undefined ? fallback : data
}

export function responseArrayData(response: unknown): readonly unknown[] {
    const data = extractResponseData<unknown>(response)
    return Array.isArray(data) ? data : []
}

export function recordFromUnknown(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key]
    return typeof value === 'string' ? value : undefined
}

export function numberField(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
    const value = record[key]
    return typeof value === 'boolean' ? value : undefined
}

export function hasFields(value: object) {
    return Object.keys(value).length > 0
}
