export interface BoardEntry {
    id: string
    key: string
    kind: 'artifact' | 'finding' | 'task' | 'note'
    author: string
    content: string
    version: number
    timestamp: number
    pinned?: boolean
    locked?: boolean
    status?: 'open' | 'in_progress' | 'done'
}

export interface ActivityEvent {
    id: string
    type: string
    source: string
    timestamp: number
    payload: Record<string, unknown>
}

export type TeamBoardActivityState = {
    events: ActivityEvent[]
    hasMore: boolean
    nextBefore: number
}

export const ACTIVITY_PAGE_SIZE = 10

export const STATUS_LABELS: Record<NonNullable<BoardEntry['status']>, string> = {
    open: 'open',
    in_progress: 'in progress',
    done: 'done',
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function toBoardEntry(raw: unknown): BoardEntry | null {
    if (!isRecord(raw)) return null
    if (typeof raw.key !== 'string' || typeof raw.content !== 'string') return null
    return {
        id: typeof raw.id === 'string' ? raw.id : String(raw.key),
        key: raw.key,
        kind: (['artifact', 'finding', 'task', 'note'].includes(raw.kind as string)
            ? raw.kind : 'note') as BoardEntry['kind'],
        author: typeof raw.author === 'string' ? raw.author : 'unknown',
        content: raw.content,
        version: typeof raw.version === 'number' ? raw.version : 1,
        timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
        pinned: !!raw.pinned,
        locked: !!raw.locked,
        status: ['open', 'in_progress', 'done'].includes(raw.status as string)
            ? (raw.status as BoardEntry['status'])
            : undefined,
    }
}

export function toActivityEvent(raw: unknown, index: number): ActivityEvent | null {
    if (!isRecord(raw)) return null
    return {
        id: typeof raw.id === 'string' ? raw.id : `evt-${index}`,
        type: typeof raw.type === 'string' ? raw.type : 'unknown',
        source: typeof raw.source === 'string' ? raw.source : 'runtime',
        timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
        payload: raw.payload && typeof raw.payload === 'object'
            ? raw.payload as Record<string, unknown> : {},
    }
}

export function relativeTime(timestamp: number): string {
    const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
    if (diff < 10) return 'just now'
    if (diff < 60) return `${diff}s ago`
    const mins = Math.floor(diff / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}
