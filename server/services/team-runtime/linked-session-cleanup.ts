import { getOpencode } from '../../lib/opencode.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { deleteSessionOwnership } from '../chat/session-ownership-service.js'

export async function deleteLinkedOpenCodeSessions(params: {
    workingDir: string
    sessionIds: string[]
}) {
    const { workingDir, sessionIds } = params
    if (sessionIds.length === 0) {
        return
    }

    const oc = await getOpencode()
    for (const sessionId of Array.from(new Set(sessionIds))) {
        try {
            unwrapOpencodeResult(await oc.session.delete({
                sessionID: sessionId,
                directory: workingDir,
            }))
        } catch (error) {
            console.warn('[team-runtime] Failed to delete linked OpenCode session', {
                sessionId,
                workingDir,
                error,
            })
        }
        await deleteSessionOwnership(sessionId).catch((error) => {
            console.warn('[team-runtime] Failed to delete linked session ownership', {
                sessionId,
                workingDir,
                error,
            })
        })
    }
}
