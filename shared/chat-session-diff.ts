import type {
    ChatSessionDiffEntry,
    ChatSessionDiffStatus,
} from './chat-contracts.js'

type DiffSummary = Pick<ChatSessionDiffEntry, 'additions' | 'deletions'>

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: Record<string, unknown>, ...keys: string[]): string | null {
    let current: unknown = value
    for (const key of keys) {
        if (!isRecord(current) || !(key in current)) {
            return null
        }
        current = current[key]
    }
    return typeof current === 'string' && current.trim() ? current : null
}

function readNumber(value: Record<string, unknown>, ...keys: string[]): number | null {
    let current: unknown = value
    for (const key of keys) {
        if (!isRecord(current) || !(key in current)) {
            return null
        }
        current = current[key]
    }
    return typeof current === 'number' && Number.isFinite(current) ? current : null
}

export function countUnifiedDiffChanges(diff: string): DiffSummary {
    const lines = diff.split('\n')
    return {
        additions: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
        deletions: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
    }
}

export function normalizeChatSessionDiffStatus(
    value: string | null | undefined,
    before: string,
    after: string,
): ChatSessionDiffStatus {
    if (value === 'added' || value === 'create' || value === 'created') {
        return 'added'
    }
    if (value === 'deleted' || value === 'delete' || value === 'removed') {
        return 'deleted'
    }
    if (!before && after) {
        return 'added'
    }
    if (before && !after) {
        return 'deleted'
    }
    return 'modified'
}

export function normalizeChatSessionDiffEntry(entry: unknown): ChatSessionDiffEntry | null {
    if (!isRecord(entry)) {
        return null
    }

    const file = readString(entry, 'file')
        || readString(entry, 'path')
        || readString(entry, 'relativePath')
        || readString(entry, 'post_name')
        || readString(entry, 'pre_name')
    if (!file) {
        return null
    }

    const before = readString(entry, 'before') || ''
    const after = readString(entry, 'after') || ''
    const rawDiff = readString(entry, 'rawDiff') || readString(entry, 'diff') || readString(entry, 'patch') || undefined
    const summary = rawDiff
        ? countUnifiedDiffChanges(rawDiff)
        : {
            additions: readNumber(entry, 'additions') || (after ? after.split('\n').length : 0),
            deletions: readNumber(entry, 'deletions') || (before ? before.split('\n').length : 0),
        }

    return {
        file,
        before,
        after,
        additions: summary.additions,
        deletions: summary.deletions,
        status: normalizeChatSessionDiffStatus(
            readString(entry, 'status') || readString(entry, 'type'),
            before,
            after,
        ),
        ...(rawDiff ? { rawDiff } : {}),
    }
}

function upsertDiff(fileMap: Map<string, ChatSessionDiffEntry>, next: ChatSessionDiffEntry) {
    const existing = fileMap.get(next.file)
    if (!existing) {
        fileMap.set(next.file, next)
        return
    }
    fileMap.set(next.file, {
        ...existing,
        ...next,
        before: next.before || existing.before,
        after: next.after || existing.after,
        additions: Math.max(existing.additions, next.additions),
        deletions: Math.max(existing.deletions, next.deletions),
        status: next.status || existing.status,
        rawDiff: next.rawDiff || existing.rawDiff,
    })
}

export function normalizeChatSessionDiffEntries(entries: unknown): ChatSessionDiffEntry[] {
    if (!Array.isArray(entries) || entries.length === 0) {
        return []
    }

    const fileMap = new Map<string, ChatSessionDiffEntry>()
    entries.forEach((entry) => {
        const normalized = normalizeChatSessionDiffEntry(entry)
        if (normalized) {
            upsertDiff(fileMap, normalized)
        }
    })
    return Array.from(fileMap.values())
}
