import type { TeamThreadSummary } from '../../../shared/team-types.js'

type TeamRuntimeStreamEvent =
    | {
        type: 'team.thread.updated'
        properties: {
            thread: TeamThreadSummary
        }
    }
    | {
        type: 'team.thread.deleted'
        properties: {
            teamId: string
            threadId: string
        }
    }

type Listener = (event: TeamRuntimeStreamEvent) => void

const listenersByWorkingDir = new Map<string, Set<Listener>>()

function cloneThreadSummary(thread: TeamThreadSummary): TeamThreadSummary {
    return {
        id: thread.id,
        teamId: thread.teamId,
        ...(thread.name ? { name: thread.name } : {}),
        participantSessions: { ...thread.participantSessions },
        participantStatuses: Object.fromEntries(
            Object.entries(thread.participantStatuses || {}).map(([participantKey, status]) => [participantKey, { ...status }]),
        ),
        createdAt: thread.createdAt,
        status: thread.status,
    }
}

function publish(workingDir: string, event: TeamRuntimeStreamEvent) {
    const listeners = listenersByWorkingDir.get(workingDir)
    if (!listeners || listeners.size === 0) {
        return
    }

    for (const listener of listeners) {
        listener(event)
    }
}

export function publishTeamThreadUpdated(workingDir: string, thread: TeamThreadSummary) {
    publish(workingDir, {
        type: 'team.thread.updated',
        properties: {
            thread: cloneThreadSummary(thread),
        },
    })
}

export function publishTeamThreadDeleted(workingDir: string, teamId: string, threadId: string) {
    publish(workingDir, {
        type: 'team.thread.deleted',
        properties: {
            teamId,
            threadId,
        },
    })
}

export function subscribeTeamRuntimeEvents(workingDir: string, listener: Listener) {
    const listeners = listenersByWorkingDir.get(workingDir) || new Set<Listener>()
    listeners.add(listener)
    listenersByWorkingDir.set(workingDir, listeners)

    return () => {
        const current = listenersByWorkingDir.get(workingDir)
        if (!current) {
            return
        }
        current.delete(listener)
        if (current.size === 0) {
            listenersByWorkingDir.delete(workingDir)
        }
    }
}
