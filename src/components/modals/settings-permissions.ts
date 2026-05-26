export type PermissionMode = 'default' | 'auto' | 'custom'

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function resolvePermissionMode(config: Record<string, unknown>): PermissionMode {
    const permission = config.permission
    if (permission === undefined) {
        return 'default'
    }

    if (permission === 'allow') {
        return 'auto'
    }

    if (!isRecord(permission)) {
        return 'custom'
    }

    const entries = Object.entries(permission)
    if (entries.length === 0) {
        return 'default'
    }

    if (entries.length === 1 && entries[0]?.[0] === '*' && entries[0]?.[1] === 'allow') {
        return 'auto'
    }

    return 'custom'
}

export function buildPermissionModePatch(autoApprove: boolean): Record<string, unknown> {
    return {
        permission: autoApprove ? { '*': 'allow' } : {},
    }
}
