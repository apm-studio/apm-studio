import type { WorkspaceGetState, WorkspaceSetState } from './action-context'
import { setWorkingDirImpl } from './context-actions'
import {
    closeWorkspaceImpl,
    deleteWorkspaceImpl,
    listWorkspacesImpl,
} from './workspace-lifecycle-actions'
import {
    loadWorkspace as loadWorkspaceImpl,
    newWorkspace as newWorkspaceImpl,
    saveWorkspace as saveWorkspaceImpl,
} from './operations'
import type { WorkspaceSlice } from './types'

type WorkspaceStorageActions = Pick<WorkspaceSlice,
    | 'setWorkingDir'
    | 'newWorkspace'
    | 'closeWorkspace'
    | 'saveWorkspace'
    | 'loadWorkspace'
    | 'listWorkspaces'
    | 'deleteWorkspace'
>

export function createWorkspaceStorageActions(set: WorkspaceSetState, get: WorkspaceGetState): WorkspaceStorageActions {
    return {
        setWorkingDir: (dir) => setWorkingDirImpl(get, set, dir),
        newWorkspace: async () => newWorkspaceImpl(get, set),
        closeWorkspace: async (workspaceId) => closeWorkspaceImpl(get, set, workspaceId),
        saveWorkspace: async () => saveWorkspaceImpl(get, set),
        loadWorkspace: async (workspaceId) => loadWorkspaceImpl(workspaceId, get, set),
        listWorkspaces: async () => listWorkspacesImpl(set),
        deleteWorkspace: async (workspaceId) => deleteWorkspaceImpl(get, set, workspaceId),
    }
}
