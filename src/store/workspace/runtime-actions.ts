import {
    applyPendingRuntimeReloadImpl,
    markRuntimeReloadPendingImpl,
} from '../runtime/reload-actions'
import type { WorkspaceGetState, WorkspaceSetState } from './action-context'
import type { WorkspaceSlice } from './types'

type WorkspaceRuntimeActions = Pick<WorkspaceSlice,
    | 'markRuntimeReloadPending'
    | 'clearRuntimeReloadPending'
    | 'applyPendingRuntimeReload'
>

export function createWorkspaceRuntimeActions(set: WorkspaceSetState, get: WorkspaceGetState): WorkspaceRuntimeActions {
    return {
        markRuntimeReloadPending: () => markRuntimeReloadPendingImpl(get, set),
        clearRuntimeReloadPending: () => set({ runtimeReloadPending: false }),
        applyPendingRuntimeReload: async () => applyPendingRuntimeReloadImpl(get, set),
    }
}
