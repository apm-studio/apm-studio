/**
 * thread-manager.ts — Team Thread lifecycle management
 *
 * PRD §5: Thread is an execution instance of a Team.
 * Manages: creation, status transitions, participant session mapping, shutdown.
 *
 * Storage: ~/.apm-studio/workspaces/<workspaceId>/team-runtime/<teamId>/<threadId>/
 *   - thread.json   — Thread metadata + mailbox state (WS5)
 *   - board.json    — Callboard entries
 *   - events.jsonl  — Append-only event log
 */

import { nanoid } from 'nanoid'
import type {
    TeamThread,
    TeamThreadStatus,
    MailboxEvent,
    TeamDefinition,
    TeamParticipantSessionStatus,
    TeamThreadSummary,
} from '../../../shared/team-types.js'
import { saveBoardToFile, loadBoardFromFile } from './board-persistence.js'
import { publishTeamThreadDeleted, publishTeamThreadUpdated } from './team-runtime-events.js'
import {
    buildThreadRuntimeSummary,
    type DeletedThreadRuntime,
    type ThreadRuntime,
} from './thread-runtime-state.js'
import {
    createThreadRuntime,
    deletedRuntimeResult,
    isActiveThreadStatus,
    listThreadRuntimeIds,
    listThreadRuntimeSummaries,
} from './thread-runtime-lifecycle.js'
import {
    deletePersistedThreadRuntime,
    loadPersistedThreadRuntimes,
    persistThreadSnapshot,
} from './thread-snapshot-persistence.js'
import {
    setRuntimeParticipantStatus,
    syncRuntimeTeamDefinition,
} from './thread-participant-sessions.js'


// ── ThreadManager ───────────────────────────────────────

export class ThreadManager {
    private threads: Map<string, ThreadRuntime> = new Map()
    private readonly _workspaceId: string
    private readonly _workingDir: string

    constructor(workspaceId: string, workingDir: string) {
        this._workspaceId = workspaceId
        this._workingDir = workingDir
    }

    get workspaceId() { return this._workspaceId }
    get workingDir() { return this._workingDir }

    // ── Thread persistence (WS5) ────────────────────

    private async persistThread(runtime: ThreadRuntime): Promise<void> {
        await persistThreadSnapshot(this._workspaceId, runtime)
    }

    /**
     * Load all persisted threads for a given Team (or all teams).
     * Called on startup or when accessing a workspace for the first time.
     */
    async loadPersistedThreads(teamId?: string): Promise<void> {
        const loadedRuntimes = await loadPersistedThreadRuntimes({
            workspaceId: this._workspaceId,
            existingThreadIds: new Set(this.threads.keys()),
            ...(teamId ? { teamId } : {}),
        })
        for (const [threadId, runtime] of loadedRuntimes) {
            this.threads.set(threadId, runtime)
        }
    }

    // ── Thread CRUD ─────────────────────────────────

    async createThread(teamId: string, teamDefinition?: TeamDefinition): Promise<TeamThread> {
        const runtime = createThreadRuntime({
            workspaceId: this._workspaceId,
            teamId,
            threadId: nanoid(),
            createdAt: Date.now(),
            teamDefinition,
        })
        this.threads.set(runtime.thread.id, runtime)

        // WS5: persist immediately
        await this.persistThread(runtime)
        this.publishThreadSummary(runtime)

        return runtime.thread
    }

    getThread(threadId: string): TeamThread | null {
        const runtime = this.threads.get(threadId)
        if (!runtime) return null
        // Sync mailbox state snapshot into thread
        runtime.thread.mailbox = runtime.mailbox.getState()
        return runtime.thread
    }

    getThreadSummary(threadId: string): TeamThreadSummary | null {
        const runtime = this.threads.get(threadId)
        if (!runtime) return null
        return this.buildThreadSummary(runtime)
    }

    getThreadRuntime(threadId: string): ThreadRuntime | null {
        return this.threads.get(threadId) || null
    }

    listThreadIds(teamId: string, statuses?: TeamThreadStatus[]): string[] {
        return listThreadRuntimeIds(this.threads.values(), teamId, statuses)
    }

    listThreads(teamId: string): TeamThreadSummary[] {
        return listThreadRuntimeSummaries(this.threads.values(), teamId)
    }

    listLoadedThreadIds(): string[] {
        return Array.from(this.threads.keys())
    }

    async deleteThread(threadId: string): Promise<DeletedThreadRuntime> {
        const runtime = this.threads.get(threadId)
        if (!runtime) {
            return deletedRuntimeResult(null)
        }
        const result = deletedRuntimeResult(runtime)
        const teamId = runtime.thread.teamId
        this.threads.delete(threadId)
        publishTeamThreadDeleted(this._workingDir, teamId, threadId)
        await deletePersistedThreadRuntime(this._workspaceId, teamId, threadId)
        return result
    }

    async setThreadName(threadId: string, name: string, options?: { ifUnset?: boolean }): Promise<TeamThreadSummary | null> {
        const runtime = this.threads.get(threadId)
        if (!runtime) {
            return null
        }

        const trimmed = name.trim()
        if (!trimmed) {
            return null
        }

        if (options?.ifUnset && runtime.thread.name?.trim()) {
            return this.buildThreadSummary(runtime)
        }

        if (runtime.thread.name === trimmed) {
            return this.buildThreadSummary(runtime)
        }

        runtime.thread.name = trimmed
        await this.persistThread(runtime)
        this.publishThreadSummary(runtime)
        return this.buildThreadSummary(runtime)
    }

    /** Get the Team definition for a thread (stored from client on creation) */
    getTeamDefinition(threadId: string): TeamDefinition | undefined {
        return this.threads.get(threadId)?.teamDefinition
    }

    // ── Status transitions ──────────────────────────

    async markActive(threadId: string): Promise<void> {
        await this.setThreadStatus(threadId, 'active')
    }

    async markIdle(threadId: string): Promise<void> {
        await this.setThreadStatus(threadId, 'idle')
    }

    async markCompleted(threadId: string): Promise<void> {
        await this.setThreadStatus(threadId, 'completed')
    }

    async markInterrupted(threadId: string): Promise<void> {
        await this.setThreadStatus(threadId, 'interrupted')
    }

    private async setThreadStatus(threadId: string, status: TeamThreadStatus): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (runtime) {
            runtime.thread.status = status
            await this.persistThread(runtime)
            this.publishThreadSummary(runtime)
        }
    }

    // ── Participant session mapping ─────────────────

    /**
     * Get or create a session ID for a participant within a thread.
     * Session creation is deferred to the caller — this just manages the mapping.
     */
    async getOrCreateSession(threadId: string, participantKey: string, createSessionId: () => string): Promise<string> {
        const runtime = this.threads.get(threadId)
        if (!runtime) throw new Error(`Thread ${threadId} not found`)

        const existing = runtime.thread.participantSessions[participantKey]
        if (existing) return existing

        const sessionId = createSessionId()
        runtime.thread.participantSessions[participantKey] = sessionId
        runtime.thread.participantStatuses[participantKey] = runtime.thread.participantStatuses[participantKey] || {
            type: 'idle',
            updatedAt: Date.now(),
        }
        await this.persistThread(runtime)
        this.publishThreadSummary(runtime)
        return sessionId
    }

    getAgentSession(threadId: string, participantKey: string): string | null {
        const runtime = this.threads.get(threadId)
        if (!runtime) return null
        return runtime.thread.participantSessions[participantKey] || null
    }

    async syncThreadTeamDefinition(threadId: string, nextTeamDefinition: TeamDefinition): Promise<boolean> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return false

        syncRuntimeTeamDefinition(runtime, nextTeamDefinition)
        await this.persistThread(runtime)
        this.publishThreadSummary(runtime)
        return true
    }

    async setParticipantStatus(
        threadId: string,
        participantKey: string,
        status: Pick<TeamParticipantSessionStatus, 'type' | 'message'>,
    ): Promise<TeamParticipantSessionStatus | null> {
        const runtime = this.threads.get(threadId)
        if (!runtime) {
            return null
        }

        const nextStatus = setRuntimeParticipantStatus(runtime, participantKey, status)
        await this.persistThread(runtime)
        this.publishThreadSummary(runtime)
        return nextStatus
    }

    // ── Event logging ───────────────────────────────

    async logEvent(threadId: string, event: MailboxEvent): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return
        await runtime.eventLogger.appendEvent(event)
    }

    async getRecentEvents(threadId: string, count: number = 50): Promise<MailboxEvent[]> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return []
        return runtime.eventLogger.tailEvents(count)
    }

    async getRecentEventsPage(threadId: string, count: number = 50, before = 0) {
        const runtime = this.threads.get(threadId)
        if (!runtime) {
            return {
                events: [],
                total: 0,
                hasMore: false,
                nextBefore: 0,
            }
        }
        return runtime.eventLogger.readRecentEventsPage(count, before)
    }

    // ── Board persistence ───────────────────────────

    async persistBoard(threadId: string): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return
        const entries = runtime.mailbox.getBoardSnapshot()
        await saveBoardToFile(
            this._workspaceId,
            runtime.thread.teamId,
            threadId,
            entries,
        )
    }

    async restoreBoard(threadId: string): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return
        const entries = await loadBoardFromFile(
            this._workspaceId,
            runtime.thread.teamId,
            threadId,
        )
        runtime.mailbox.restoreBoard(entries)
    }

    // ── Shutdown ─────────────────────────────────────

    /**
     * Shutdown a single thread: persist board + thread state, discard ephemeral state.
     */
    async shutdownThread(threadId: string): Promise<void> {
        const runtime = this.threads.get(threadId)
        if (!runtime) return

        // Mark as interrupted if still running
        if (isActiveThreadStatus(runtime.thread.status)) {
            runtime.thread.status = 'interrupted'
        }

        // Persist board before shutdown
        const { board } = runtime.mailbox.shutdown()
        await saveBoardToFile(
            this._workspaceId,
            runtime.thread.teamId,
            threadId,
            board,
        )

        // Persist thread metadata
        await this.persistThread(runtime)
    }

    /**
     * Shutdown all active threads (server restart scenario).
     */
    async shutdownAllThreads(): Promise<void> {
        const promises: Promise<void>[] = []
        for (const [threadId, runtime] of this.threads) {
            if (isActiveThreadStatus(runtime.thread.status)) {
                promises.push(this.shutdownThread(threadId))
            }
        }
        await Promise.all(promises)
    }

    /**
     * Get the number of active threads.
     */
    getActiveThreadCount(): number {
        let count = 0
        for (const runtime of this.threads.values()) {
            if (isActiveThreadStatus(runtime.thread.status)) {
                count++
            }
        }
        return count
    }

    private buildThreadSummary(runtime: ThreadRuntime): TeamThreadSummary {
        return buildThreadRuntimeSummary(runtime)
    }

    private publishThreadSummary(runtime: ThreadRuntime) {
        publishTeamThreadUpdated(this._workingDir, this.buildThreadSummary(runtime))
    }
}
