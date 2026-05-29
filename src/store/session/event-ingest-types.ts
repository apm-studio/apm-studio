import type { StudioState } from '../types'

export type SessionEventSetState = (
    partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)
) => void
export type SessionEventGetState = () => StudioState

export interface EventIngestOptions {
    get: SessionEventGetState
    set: SessionEventSetState
    onHeartbeatTimeout?: () => void
    onSessionIdle?: (sessionId: string) => void
    onSessionCompacted?: (sessionId: string) => void
}

export type SessionEventDispatchContext = Pick<EventIngestOptions,
    | 'get'
    | 'set'
    | 'onSessionIdle'
    | 'onSessionCompacted'
>

export const HEARTBEAT_TIMEOUT_MS = 30_000
export const MAX_EVENTS_PER_FRAME = 100
export const FRAME_BUDGET_MS = 8
