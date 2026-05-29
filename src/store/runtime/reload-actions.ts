import { opencodeApi } from '../../api-clients/opencode'
import { showToast } from '../../lib/toast'
import type { StudioState } from '../types'
import { hasRunningStudioSessions } from './reload-utils'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

const RUNTIME_RELOAD_RETRY_MS = 300

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function markRuntimeReloadPendingImpl(get: GetState, set: SetState) {
    const state = get()
    if (!state.workingDir) {
        return
    }
    if (!state.runtimeReloadPending) {
        set({ runtimeReloadPending: true })
    }
    if (hasRunningStudioSessions(state)) {
        showToast(
            'Runtime-affecting changes were made while a session is running. Finish the current run before starting a new chat.',
            'warning',
            {
                title: 'Finish current run first',
                dedupeKey: `runtime-reload-pending:${state.workingDir}`,
                durationMs: 6000,
            },
        )
    }
}

export async function applyPendingRuntimeReloadImpl(get: GetState, set: SetState) {
    const state = get()
    if (!state.runtimeReloadPending || !state.workingDir) {
        return false
    }

    try {
        let result = await opencodeApi.applyRuntimeReload()
        if (
            result.blocked
            && result.runningSessions > 0
            && !hasRunningStudioSessions(get())
        ) {
            await sleep(RUNTIME_RELOAD_RETRY_MS)
            result = await opencodeApi.applyRuntimeReload()
        }
        if (result.applied) {
            set({ runtimeReloadPending: false })
            return true
        }
        if (result.blocked) {
            showToast(
                `OpenCode still has ${result.runningSessions} running session${result.runningSessions === 1 ? '' : 's'}. New chats stay blocked until those runs finish.`,
                'warning',
                {
                    title: 'New chat blocked',
                    dedupeKey: `runtime-reload-blocked:${state.workingDir}`,
                    durationMs: 6000,
                },
            )
        }
    } catch (error) {
        showToast(
            error instanceof Error ? error.message : 'Failed to apply queued runtime changes.',
            'error',
            {
                title: 'Runtime refresh failed',
                dedupeKey: `runtime-reload-error:${state.workingDir}`,
            },
        )
    }

    return false
}
