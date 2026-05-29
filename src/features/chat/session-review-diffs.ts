import type {
    ChatSessionDiffEntry,
    ChatSessionDiffStatus,
} from '../../../shared/chat-contracts'

export type FileDiffInfo = ChatSessionDiffEntry

function isDiffStatus(value: unknown): value is ChatSessionDiffStatus {
    return value === 'added' || value === 'modified' || value === 'deleted'
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function normalizeSessionDiffEntry(entry: unknown): FileDiffInfo | null {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null
    }
    const record = entry as Record<string, unknown>
    if (
        typeof record.file !== 'string'
        || typeof record.before !== 'string'
        || typeof record.after !== 'string'
        || !isFiniteNumber(record.additions)
        || !isFiniteNumber(record.deletions)
        || !isDiffStatus(record.status)
    ) {
        return null
    }

    return {
        file: record.file,
        before: record.before,
        after: record.after,
        additions: record.additions,
        deletions: record.deletions,
        status: record.status,
        ...(typeof record.rawDiff === 'string' && record.rawDiff.trim() ? { rawDiff: record.rawDiff } : {}),
    }
}

export function normalizeSessionDiffEntries(entries: ChatSessionDiffEntry[] | null | undefined): FileDiffInfo[] {
    if (!Array.isArray(entries)) {
        return []
    }
    return entries
        .map(normalizeSessionDiffEntry)
        .filter((entry): entry is FileDiffInfo => !!entry)
}
