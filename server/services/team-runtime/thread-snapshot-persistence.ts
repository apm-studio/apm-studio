import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
    MailboxState,
    TeamDefinition,
    TeamParticipantSessionStatus,
    TeamThreadStatus,
} from '../../../shared/team-types.js'
import { workspaceDir, workspaceTeamRuntimeDir } from '../../lib/config.js'
import { loadBoardFromFile } from './board-persistence.js'
import { EventLogger } from './event-logger.js'
import { Mailbox } from './mailbox.js'
import {
    cloneParticipantStatuses,
    type ThreadRuntime,
} from './thread-runtime-state.js'

const THREAD_SNAPSHOT_SCHEMA_VERSION = 2

interface PersistedThreadState {
    id: string
    teamId: string
    name?: string
    mailbox?: MailboxState
    participantSessions: Record<string, string>
    participantStatuses: Record<string, TeamParticipantSessionStatus>
    retiredParticipantSessions: Record<string, string[]>
    createdAt: number
    status: TeamThreadStatus
}

interface ThreadSnapshot {
    schemaVersion: 2
    thread: PersistedThreadState
    teamDefinition?: TeamDefinition
}

function threadJsonPath(workspaceId: string, teamId: string, threadId: string): string {
    return join(workspaceTeamRuntimeDir(workspaceId, teamId, threadId), 'thread.json')
}

export async function persistThreadSnapshot(workspaceId: string, runtime: ThreadRuntime): Promise<void> {
    const filePath = threadJsonPath(workspaceId, runtime.thread.teamId, runtime.thread.id)
    const dir = join(filePath, '..')
    await fs.mkdir(dir, { recursive: true })
    const snapshot: ThreadSnapshot = {
        schemaVersion: THREAD_SNAPSHOT_SCHEMA_VERSION,
        thread: {
            id: runtime.thread.id,
            teamId: runtime.thread.teamId,
            ...(runtime.thread.name ? { name: runtime.thread.name } : {}),
            mailbox: runtime.mailbox.getState(),
            participantSessions: { ...runtime.thread.participantSessions },
            participantStatuses: cloneParticipantStatuses(runtime.thread.participantStatuses),
            retiredParticipantSessions: Object.fromEntries(
                Object.entries(runtime.retiredParticipantSessions).map(([key, sessionIds]) => [key, [...sessionIds]]),
            ),
            createdAt: runtime.thread.createdAt,
            status: runtime.thread.status,
        },
        teamDefinition: runtime.teamDefinition,
    }
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8')
}

export async function loadPersistedThreadRuntimes(params: {
    workspaceId: string
    existingThreadIds: ReadonlySet<string>
    teamId?: string
}): Promise<Array<[string, ThreadRuntime]>> {
    const { workspaceId, existingThreadIds, teamId } = params
    const runtimeRoot = join(workspaceDir(workspaceId), 'team-runtime')
    const loaded: Array<[string, ThreadRuntime]> = []

    let teamDirs: string[]
    try {
        teamDirs = teamId ? [teamId] : await fs.readdir(runtimeRoot)
    } catch {
        return loaded
    }

    for (const team of teamDirs) {
        const teamDir = join(runtimeRoot, team)
        let threadDirs: string[]
        try {
            threadDirs = await fs.readdir(teamDir)
        } catch {
            continue
        }

        for (const threadDir of threadDirs) {
            if (existingThreadIds.has(threadDir)) continue

            const runtime = await loadThreadRuntime(workspaceId, team, threadDir)
            if (runtime) {
                loaded.push([threadDir, runtime])
            }
        }
    }

    return loaded
}

export async function deletePersistedThreadRuntime(workspaceId: string, teamId: string, threadId: string) {
    const dir = workspaceTeamRuntimeDir(workspaceId, teamId, threadId)
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
}

async function loadThreadRuntime(
    workspaceId: string,
    teamId: string,
    threadId: string,
): Promise<ThreadRuntime | null> {
    const threadDir = workspaceTeamRuntimeDir(workspaceId, teamId, threadId)
    const filePath = join(threadDir, 'thread.json')

    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const snapshot = JSON.parse(raw) as Partial<ThreadSnapshot>
        if (snapshot.schemaVersion !== THREAD_SNAPSHOT_SCHEMA_VERSION) {
            await fs.rm(threadDir, { recursive: true, force: true })
            return null
        }

        const persistedThread = snapshot.thread
        if (!persistedThread) {
            await fs.rm(threadDir, { recursive: true, force: true })
            return null
        }

        const mailbox = new Mailbox()
        const persistedBoard = await loadBoardFromFile(workspaceId, teamId, threadId)
        mailbox.restoreBoard(persistedBoard)

        const restoredMailboxState = persistedThread.mailbox
            ? {
                ...persistedThread.mailbox,
                board: Object.fromEntries(persistedBoard.map((entry) => [entry.key, entry])),
            }
            : null
        if (restoredMailboxState) {
            mailbox.restoreFromState(restoredMailboxState)
        } else {
            mailbox.restoreBoard(persistedBoard)
        }

        const eventLogger = new EventLogger(workspaceId, teamId, threadId)
        return {
            thread: {
                id: persistedThread.id,
                teamId: persistedThread.teamId,
                ...(persistedThread.name ? { name: persistedThread.name } : {}),
                mailbox: mailbox.getState(),
                participantSessions: { ...(persistedThread.participantSessions || {}) },
                participantStatuses: cloneParticipantStatuses(persistedThread.participantStatuses || {}),
                createdAt: persistedThread.createdAt,
                status: persistedThread.status,
            },
            mailbox,
            eventLogger,
            teamDefinition: snapshot.teamDefinition,
            retiredParticipantSessions: { ...(persistedThread.retiredParticipantSessions || {}) },
        }
    } catch {
        return null
    }
}
