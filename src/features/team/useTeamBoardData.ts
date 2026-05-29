import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react'
import { teamRuntimeApi } from '../../api-clients/team-runtime'
import {
    ACTIVITY_PAGE_SIZE,
    type ActivityEvent,
    type BoardEntry,
    type TeamBoardActivityState,
    toActivityEvent,
    toBoardEntry,
} from './team-board-data'
import { mergeActivityPages } from './team-board-view-utils'

const EMPTY_ACTIVITY_STATE: TeamBoardActivityState = {
    events: [],
    hasMore: false,
    nextBefore: 0,
}

export function useTeamBoardData(teamId: string, threadId: string) {
    const activityListRef = useRef<HTMLDivElement | null>(null)
    const fullEntryKeysRef = useRef<Set<string>>(new Set())
    const [entries, setEntries] = useState<BoardEntry[]>([])
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [loadingMoreEvents, setLoadingMoreEvents] = useState(false)
    const [loadingExpandedKeys, setLoadingExpandedKeys] = useState<Set<string>>(new Set())
    const [lastUpdated, setLastUpdated] = useState<number | null>(null)
    const [activityState, setActivityState] = useState<TeamBoardActivityState>(EMPTY_ACTIVITY_STATE)

    useEffect(() => {
        fullEntryKeysRef.current = new Set()
        setEntries([])
        setExpandedKeys(new Set())
        setLoadingExpandedKeys(new Set())
        setLastUpdated(null)
        setActivityState(EMPTY_ACTIVITY_STATE)
    }, [teamId, threadId])

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [boardResult, eventResult] = await Promise.all([
                teamRuntimeApi.readBoard(teamId, threadId),
                teamRuntimeApi.events(teamId, threadId, ACTIVITY_PAGE_SIZE),
            ])
            setEntries((prev) => mergeBoardEntryPage(prev, boardResult.entries || [], fullEntryKeysRef.current))
            setActivityState((prev) => mergeActivityResult(prev, eventResult.events || [], eventResult.total, 'prependLatest'))
            setLastUpdated(Date.now())
        } catch (err) {
            console.error('[TeamBoardView] Failed to load board data', err)
        } finally {
            setLoading(false)
        }
    }, [teamId, threadId])

    const loadMoreEvents = useCallback(async () => {
        if (loadingMoreEvents || loading || !activityState.hasMore) return
        setLoadingMoreEvents(true)
        try {
            const result = await teamRuntimeApi.events(teamId, threadId, ACTIVITY_PAGE_SIZE, activityState.nextBefore)
            setActivityState((prev) => mergeActivityResult(
                prev,
                result.events || [],
                result.total,
                'appendOlder',
                activityState.nextBefore,
            ))
        } catch (err) {
            console.error('[TeamBoardView] Failed to load more events', err)
        } finally {
            setLoadingMoreEvents(false)
        }
    }, [teamId, activityState.hasMore, activityState.nextBefore, loading, loadingMoreEvents, threadId])

    useEffect(() => { loadData() }, [loadData])

    useEffect(() => {
        const interval = setInterval(loadData, 5000)
        return () => clearInterval(interval)
    }, [loadData])

    const toggleExpand = useCallback((key: string) => {
        const shouldExpand = !expandedKeys.has(key)
        setExpandedKeys((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })

        if (!shouldExpand || fullEntryKeysRef.current.has(key)) return

        setLoadingExpandedKeys((prev) => {
            const next = new Set(prev)
            next.add(key)
            return next
        })

        void teamRuntimeApi.readBoard(teamId, threadId, key)
            .then((result) => {
                const fullEntry = (result.entries || [])
                    .map(toBoardEntry)
                    .find((entry): entry is BoardEntry => entry !== null && entry.key === key)
                if (!fullEntry) return
                fullEntryKeysRef.current.add(key)
                setEntries((prev) => prev.map((entry) => (
                    entry.key === key
                        ? { ...entry, ...fullEntry, content: fullEntry.content }
                        : entry
                )))
            })
            .catch((err) => {
                console.error('[TeamBoardView] Failed to load full board entry', err)
            })
            .finally(() => {
                setLoadingExpandedKeys((prev) => {
                    const next = new Set(prev)
                    next.delete(key)
                    return next
                })
            })
    }, [teamId, expandedKeys, threadId])

    const handleActivityScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        if (loadingMoreEvents || loading || !activityState.hasMore) return
        const element = event.currentTarget
        const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
        if (remaining <= 48) {
            void loadMoreEvents()
        }
    }, [activityState.hasMore, loadMoreEvents, loading, loadingMoreEvents])

    useEffect(() => {
        if (loadingMoreEvents || loading || !activityState.hasMore || activityState.events.length === 0) return
        const element = activityListRef.current
        if (!element) return
        if (element.scrollHeight <= element.clientHeight + 8) {
            void loadMoreEvents()
        }
    }, [activityState.events.length, activityState.hasMore, loadMoreEvents, loading, loadingMoreEvents])

    return {
        activityListRef,
        activityState,
        entries,
        expandedKeys,
        handleActivityScroll,
        lastUpdated,
        loadData,
        loading,
        loadingExpandedKeys,
        loadingMoreEvents,
        toggleExpand,
    }
}

function mergeBoardEntryPage(
    previousEntries: BoardEntry[],
    rawEntries: unknown[],
    fullEntryKeys: Set<string>,
) {
    const previousByKey = new Map(previousEntries.map((entry) => [entry.key, entry]))
    return rawEntries
        .map(toBoardEntry)
        .filter((entry): entry is BoardEntry => entry !== null)
        .map((entry) => {
            const previous = previousByKey.get(entry.key)
            if (!previous) return entry
            if (!fullEntryKeys.has(entry.key)) return entry
            if (previous.version !== entry.version) {
                fullEntryKeys.delete(entry.key)
                return entry
            }
            return {
                ...entry,
                content: previous.content,
            }
        })
        .sort((a, b) => b.timestamp - a.timestamp)
}

function mergeActivityResult(
    previous: TeamBoardActivityState,
    rawEvents: unknown[],
    total: unknown,
    mode: 'prependLatest' | 'appendOlder',
    indexOffset = 0,
) {
    const pageEvents = rawEvents
        .map((event, index) => toActivityEvent(event, index + indexOffset))
        .filter((event): event is ActivityEvent => event !== null)
    const merged = mergeActivityPages(previous.events, pageEvents, mode)
    const totalCount = typeof total === 'number' ? total : merged.length
    return {
        events: merged,
        hasMore: merged.length < totalCount,
        nextBefore: merged.length,
    }
}
