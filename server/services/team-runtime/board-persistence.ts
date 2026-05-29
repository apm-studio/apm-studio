/**
 * board-persistence.ts — Board file persistence
 *
 * PRD §6.2: Board is durable — persisted to file and survives shutdown.
 * Path: ~/.apm-studio/workspaces/<workspaceId>/team-runtime/<teamId>/<threadId>/board.json
 */

import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { BoardEntry } from '../../../shared/team-types.js'
import { workspaceTeamRuntimeDir } from '../../lib/config.js'

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
}

function boardFilePath(workspaceId: string, teamId: string, threadId: string): string {
    return join(workspaceTeamRuntimeDir(workspaceId, teamId, threadId), 'board.json')
}

/**
 * Save board entries to file.
 */
export async function saveBoardToFile(
    workspaceId: string,
    teamId: string,
    threadId: string,
    entries: BoardEntry[],
): Promise<void> {
    const filePath = boardFilePath(workspaceId, teamId, threadId)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf-8')
}

/**
 * Load board entries from file.
 */
export async function loadBoardFromFile(
    workspaceId: string,
    teamId: string,
    threadId: string,
): Promise<BoardEntry[]> {
    const filePath = boardFilePath(workspaceId, teamId, threadId)
    try {
        const content = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(content) as BoardEntry[]
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') return []
        throw error
    }
}
