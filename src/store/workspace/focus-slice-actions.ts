import type { WorkspaceGetState, WorkspaceSetState } from './action-context'
import {
    addSplitViewPaneImpl,
    enterEmptyFullViewImpl,
    enterEmptySplitViewImpl,
    enterFocusModeImpl,
    enterSplitViewImpl,
    exitFocusModeImpl,
    insertSplitViewPaneImpl,
    moveSplitViewPaneImpl,
    removeSplitViewPaneImpl,
    replaceSplitViewPaneImpl,
    resizeSplitViewBoundaryImpl,
    setSplitViewActivePaneImpl,
    setSplitViewColumnsImpl,
    switchFocusTargetImpl,
} from './focus-actions'
import type { WorkspaceSlice } from './types'

type WorkspaceFocusActions = Pick<WorkspaceSlice,
    | 'enterFocusMode'
    | 'enterEmptyFullView'
    | 'enterEmptySplitView'
    | 'exitFocusMode'
    | 'switchFocusTarget'
    | 'enterSplitView'
    | 'addSplitViewPane'
    | 'insertSplitViewPane'
    | 'replaceSplitViewPane'
    | 'moveSplitViewPane'
    | 'removeSplitViewPane'
    | 'setSplitViewActivePane'
    | 'resizeSplitViewBoundary'
    | 'setSplitViewColumns'
>

export function createWorkspaceFocusActions(set: WorkspaceSetState, get: WorkspaceGetState): WorkspaceFocusActions {
    return {
        enterFocusMode: (nodeId, nodeType, viewportSize) => enterFocusModeImpl(get, set, nodeId, nodeType, viewportSize),
        enterEmptyFullView: () => enterEmptyFullViewImpl(get, set),
        enterEmptySplitView: () => enterEmptySplitViewImpl(get, set),
        exitFocusMode: () => exitFocusModeImpl(get, set),
        switchFocusTarget: (nodeId, nodeType) => switchFocusTargetImpl(get, set, nodeId, nodeType),
        enterSplitView: (nodeId, nodeType, viewportSize) => enterSplitViewImpl(get, set, nodeId, nodeType, viewportSize),
        addSplitViewPane: (nodeId, nodeType, viewportSize) => addSplitViewPaneImpl(get, set, nodeId, nodeType, viewportSize),
        insertSplitViewPane: (nodeId, nodeType, placement, viewportSize) => insertSplitViewPaneImpl(get, set, nodeId, nodeType, placement, viewportSize),
        replaceSplitViewPane: (paneId, nodeId, nodeType, viewportSize) => replaceSplitViewPaneImpl(get, set, paneId, nodeId, nodeType, viewportSize),
        moveSplitViewPane: (paneId, placement, viewportSize) => moveSplitViewPaneImpl(get, set, paneId, placement, viewportSize),
        removeSplitViewPane: (paneId, viewportSize) => removeSplitViewPaneImpl(get, set, paneId, viewportSize),
        setSplitViewActivePane: (nodeId, nodeType) => setSplitViewActivePaneImpl(get, set, nodeId, nodeType),
        resizeSplitViewBoundary: (axis, rowIndex, boundaryIndex, deltaPx, viewportSize) => resizeSplitViewBoundaryImpl(get, set, axis, rowIndex, boundaryIndex, deltaPx, viewportSize),
        setSplitViewColumns: (columns, viewportSize) => setSplitViewColumnsImpl(get, set, columns, viewportSize),
    }
}
