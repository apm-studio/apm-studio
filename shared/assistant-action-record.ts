export type ActionRecord = { [key: string]: unknown }

export function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function cleanUndefinedFields<T extends ActionRecord>(record: T): ActionRecord {
    return Object.fromEntries(
        Object.entries(record).filter(([, value]) => value !== undefined),
    )
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

export function isOptionalStringArray(value: unknown) {
    return value === undefined || (
        Array.isArray(value) && value.every((entry) => isNonEmptyString(entry))
    )
}

export function isOptionalNullableString(value: unknown) {
    return value === undefined || value === null || isNonEmptyString(value)
}

export function isOptionalBoolean(value: unknown) {
    return value === undefined || typeof value === 'boolean'
}

export function isOptionalEventTypeArray(value: unknown) {
    return value === undefined || (
        Array.isArray(value) && value.every((entry) => entry === 'runtime.idle')
    )
}

export function isOptionalFiniteNumber(value: unknown) {
    return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

export function isPositiveFiniteNumber(value: unknown) {
    return isFiniteNumber(value) && value > 0
}

export function normalizeOptionalString(value: unknown, options?: { allowNull?: boolean }) {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed ? trimmed : undefined
    }
    if (options?.allowNull && value === null) {
        return null
    }
    return value === undefined ? undefined : value
}

export function normalizeOptionalStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return value === undefined ? undefined : value
    }

    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
        .filter((entry) => entry !== '')
}

export function normalizeDraftBlueprintCandidate(value: unknown) {
    if (!isRecord(value)) {
        return value === undefined ? undefined : value
    }

    const normalizedTags = normalizeOptionalStringArray(value.tags)
    const normalized = cleanUndefinedFields({
        ...(normalizeOptionalString(value.ref) !== undefined ? { ref: normalizeOptionalString(value.ref) } : {}),
        ...(normalizeOptionalString(value.name) !== undefined ? { name: normalizeOptionalString(value.name) } : {}),
        ...(normalizeOptionalString(value.content) !== undefined ? { content: normalizeOptionalString(value.content) } : {}),
        ...(normalizeOptionalString(value.slug) !== undefined ? { slug: normalizeOptionalString(value.slug) } : {}),
        ...(normalizeOptionalString(value.description) !== undefined ? { description: normalizeOptionalString(value.description) } : {}),
        ...(Array.isArray(normalizedTags) && normalizedTags.length > 0 ? { tags: normalizedTags } : {}),
        ...(value.openEditor === true ? { openEditor: true } : {}),
    })

    return Object.keys(normalized).length === 0 ? undefined : normalized
}

export function hasMeaningfulDraftBlueprint(value: unknown) {
    return isRecord(normalizeDraftBlueprintCandidate(value))
}
