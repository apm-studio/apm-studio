import {
    classifyStudioChange,
    clearProjectionDirtyState,
    mergeProjectionDirtyState,
} from '../runtime/change-policy'
import type { WorkspaceGetState, WorkspaceSetState } from './action-context'
import type { WorkspaceSlice } from './types'

type WorkspaceProjectionActions = Pick<WorkspaceSlice,
    | 'markProjectionDirty'
    | 'clearProjectionDirty'
    | 'recordStudioChange'
>

export function createWorkspaceProjectionActions(set: WorkspaceSetState, get: WorkspaceGetState): WorkspaceProjectionActions {
    return {
        markProjectionDirty: (patch) => set((state) => ({
            projectionDirty: mergeProjectionDirtyState(state.projectionDirty, {
                kind: 'draft',
                agentIds: patch.agentIds || [],
                teamIds: patch.teamIds || [],
                draftIds: patch.draftIds || [],
                workspaceWide: patch.workspaceWide === true,
            }),
        })),

        clearProjectionDirty: (patch) => set((state) => ({
            projectionDirty: clearProjectionDirtyState(state.projectionDirty, patch),
        })),

        recordStudioChange: (change) => {
            const changeClass = classifyStudioChange(change)
            if (changeClass === 'lazy_projection' && change.kind !== 'ui' && change.kind !== 'runtime_config') {
                set((state) => ({
                    projectionDirty: mergeProjectionDirtyState(state.projectionDirty, change),
                }))
                return changeClass
            }
            if (changeClass === 'runtime_reload') {
                get().markRuntimeReloadPending()
            }
            return changeClass
        },
    }
}
