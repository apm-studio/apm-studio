export const BOARD_ENTRY_MAX_CHARS = 4000
export const BOARD_APPEND_MAX_CHARS = 600

const BOARD_SUMMARY_MAX_CHARS = 280
const BOARD_READ_LIMIT_DEFAULT = 8
const BOARD_READ_LIMIT_MAX = 25

export function normalizeBoardReadLimit(limit?: number) {
    if (!Number.isFinite(limit)) return BOARD_READ_LIMIT_DEFAULT
    return Math.max(1, Math.min(BOARD_READ_LIMIT_MAX, Math.floor(limit || BOARD_READ_LIMIT_DEFAULT)))
}

export function summarizeBoardEntry<T extends { content: string }>(entry: T): T {
    if (entry.content.length <= BOARD_SUMMARY_MAX_CHARS) {
        return entry
    }
    return {
        ...entry,
        content: `${entry.content.slice(0, BOARD_SUMMARY_MAX_CHARS)}…`,
    }
}
