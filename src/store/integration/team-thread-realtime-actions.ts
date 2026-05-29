import type { StudioState } from '../types'
import { clearChatSessionView } from '../session'
import { releaseSessionRuntimeActor } from '../session/session-runtime-manager'
import {
    applyAuthoritativeTeamThreads,
    listTeamThreadChatKeys,
} from '../team/team-thread-sync'
import { buildDeletedTeamThreadState } from '../team/selection-state'
import type { TeamThreadRuntimeSnapshot } from './realtime-event-helpers'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export function createTeamThreadRealtimeActions(input: {
    get: GetState
    set: SetState
}) {
    const { get, set } = input

    async function handleUpdated(thread: TeamThreadRuntimeSnapshot) {
        const existingThreads = get().teamThreads[thread.teamId] || []
        const nextThreads = existingThreads.some((entry) => entry.id === thread.id)
            ? existingThreads.map((entry) => (entry.id === thread.id ? thread : entry))
            : [...existingThreads, thread]

        await applyAuthoritativeTeamThreads(get, set, thread.teamId, nextThreads)
    }

    function handleDeleted(teamId: string, threadId: string) {
        const state = get()
        const removedChatKeys = listTeamThreadChatKeys(state, teamId, threadId)
        set((current) => buildDeletedTeamThreadState(current, teamId, threadId))
        for (const chatKey of removedChatKeys) {
            releaseSessionRuntimeActor(set, get, { chatKey })
            clearChatSessionView(get, chatKey)
        }
    }

    return {
        handleUpdated,
        handleDeleted,
    }
}
