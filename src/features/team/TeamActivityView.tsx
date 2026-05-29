/**
 * TeamActivityView — Polled event timeline for Team threads (5s interval).
 * Shows callboard/runtime activity for the selected thread.
 *
 * PRD §17.2: Shows participant collaboration flow, callboard artifacts, and active participants.
 */
import { useState, useEffect, useCallback } from 'react'
import {
    Activity, MessageCircle, FileText, Clock, Bell,
    RefreshCw,
} from 'lucide-react'
import { teamRuntimeApi } from '../../api-clients/team-runtime'
import './TeamActivityView.css'

interface TeamActivityViewProps {
    teamId: string
    threadId?: string | null
    mode?: 'activity' | 'callboard'
}

interface ActivityEvent {
    id: string
    type: string
    source: string
    sourceType: string
    timestamp: number
    payload: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toActivityEvent(value: unknown, index: number): ActivityEvent | null {
    if (!isRecord(value)) return null
    const id = typeof value.id === 'string' ? value.id : `event-${index}`
    const type = typeof value.type === 'string' ? value.type : 'unknown'
    const source = typeof value.source === 'string' ? value.source : 'runtime'
    const sourceType = typeof value.sourceType === 'string' ? value.sourceType : 'runtime'
    const timestamp = typeof value.timestamp === 'number' ? value.timestamp : Date.now()
    const payload = value.payload && typeof value.payload === 'object'
        ? value.payload as Record<string, unknown>
        : {}

    return {
        id,
        type,
        source,
        sourceType,
        timestamp,
        payload,
    }
}

export default function TeamActivityView({ teamId, threadId, mode = 'activity' }: TeamActivityViewProps) {
    const [events, setEvents] = useState<ActivityEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [lastUpdated, setLastUpdated] = useState<number | null>(null)

    const loadEvents = useCallback(async () => {
        if (!threadId) return
        setLoading(true)
        try {
            const result = await teamRuntimeApi.events(teamId, threadId, 50)
            setEvents((result.events || [])
                .map((event, index) => toActivityEvent(event, index))
                .filter((event): event is ActivityEvent => event !== null))
            setLastUpdated(Date.now())
        } catch (err) {
            console.error('Failed to load team events', err)
        } finally {
            setLoading(false)
        }
    }, [teamId, threadId])

    useEffect(() => {
        loadEvents()
    }, [loadEvents])

    // Auto-refresh every 5 seconds
    useEffect(() => {
        if (!threadId) return
        const interval = setInterval(loadEvents, 5000)
        return () => clearInterval(interval)
    }, [threadId, loadEvents])

    const getEventIcon = (type: string) => {
        switch (type) {
            case 'message.sent':
            case 'message.delivered':
                return <MessageCircle size={12} />
            case 'board.posted':
            case 'board.updated':
                return <FileText size={12} />
            case 'runtime.idle':
                return <Clock size={12} />
            default:
                return <Bell size={12} />
        }
    }

    const getEventDescription = (event: ActivityEvent) => {
        const { type, source, payload } = event
        switch (type) {
            case 'message.sent':
                return `${source} → message_teammate(${payload.to}${payload.tag ? `, label: ${payload.tag}` : ''})`
            case 'message.delivered':
                return `${payload.to} ← message delivered from ${source}`
            case 'board.posted':
                return `${source} → update_shared_board("${payload.key}")`
            case 'board.updated':
                return `${source} → update_shared_board("${payload.key}")`
            case 'runtime.idle':
                return 'Collaboration idle'
            default:
                return `${source}: ${type}`
        }
    }

    const formatTime = (ts: number) => {
        const d = new Date(ts)
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    if (!threadId) {
        return (
            <div className="team-activity-view">
                <div className="team-activity-view__empty">
                    <Activity size={16} />
                    <span>{mode === 'callboard' ? 'Select a thread to view the callboard' : 'Select a thread to view activity'}</span>
                </div>
            </div>
        )
    }

    return (
        <div className="team-activity-view">
            <div className="team-activity-view__header">
                <Activity size={12} />
                <span>{mode === 'callboard' ? 'Callboard' : 'Activity'}</span>
                {lastUpdated && (
                    <span className="team-activity-view__freshness" title="Auto-refreshes every 5 seconds">
                        {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                )}
                <button
                    className="icon-btn"
                    onClick={loadEvents}
                    disabled={loading}
                    title="Refresh"
                >
                    <RefreshCw size={10} className={loading ? 'spinning' : ''} />
                </button>
            </div>

            <div className="team-activity-view__timeline">
                {events.length === 0 ? (
                    <div className="team-activity-view__empty">
                        <span>{mode === 'callboard' ? 'No callboard activity yet' : 'No events yet'}</span>
                    </div>
                ) : (
                    events.map((event) => (
                        <div
                            key={event.id}
                            className={`team-activity-view__event team-activity-view__event--${event.type.split('.')[0]}`}
                        >
                            <div className="team-activity-view__event-icon">
                                {getEventIcon(event.type)}
                            </div>
                            <div className="team-activity-view__event-body">
                                <span className="team-activity-view__event-desc">
                                    {getEventDescription(event)}
                                </span>
                                <span className="team-activity-view__event-time">
                                    {formatTime(event.timestamp)}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
