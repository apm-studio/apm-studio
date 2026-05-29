import fs from 'fs/promises'
import path from 'path'
import type { WorkspaceSnapshot } from '../../../shared/workspace-contracts.js'
import { getOpencode } from '../../lib/opencode.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { workspaceDir } from '../../lib/config.js'
import {
    deleteSessionOwnership,
    listSessionOwnershipsForWorkingDir,
} from '../chat/session-ownership-service.js'
import {
    isRecord,
} from './snapshot-merge.js'
import {
    normalizeWorkingDir,
    workspaceIdForWorkingDir,
} from './document-store.js'

type WorkspaceSessionSummary = { id?: string }

export async function purgeLinkedOpencodeData(workspace: WorkspaceSnapshot) {
    const workingDir = normalizeWorkingDir(workspace?.workingDir || '')
    if (!workingDir) {
        return
    }

    const executionContexts = await listSessionOwnershipsForWorkingDir(workingDir)
    const directories = [workingDir]
    const sessionDirectories = new Map<string, string>(
        executionContexts.map((context) => [context.sessionId, context.workingDir]),
    )

    try {
        const oc = await getOpencode()
        for (const directory of directories) {
            try {
                const sessions = unwrapOpencodeResult<WorkspaceSessionSummary[]>(await oc.session.list({ directory })) || []
                for (const session of sessions) {
                    if (session?.id && !sessionDirectories.has(session.id)) {
                        sessionDirectories.set(session.id, directory)
                    }
                }
            } catch (error) {
                console.warn('[workspace] Failed to list OpenCode sessions for workspace delete', { workingDir, directory, error })
            }
        }

        for (const [sessionId, directory] of Array.from(sessionDirectories.entries())) {
            try {
                unwrapOpencodeResult(await oc.session.delete({
                    sessionID: sessionId,
                    directory,
                }))
            } catch (error) {
                console.warn('[workspace] Failed to delete OpenCode session for workspace delete', { sessionId, directory, error })
            }
            await deleteSessionOwnership(sessionId).catch(() => {})
        }
    } catch (error) {
        console.warn('[workspace] Failed to purge OpenCode data for workspace delete', { workingDir, error })
    }

    for (const team of Array.isArray(workspace?.teams) ? workspace.teams : []) {
        if (isRecord(team) && typeof team.id === 'string' && team.id) {
            await fs.rm(path.join(workspaceDir(workspaceIdForWorkingDir(workingDir)), 'team-runtime', team.id), { recursive: true, force: true }).catch(() => {})
        }
    }
}
