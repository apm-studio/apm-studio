import type { WorkspaceGetState, WorkspaceSetState } from './action-context'
import {
    addCanvasTerminalImpl,
    removeCanvasTerminalImpl,
    updateCanvasTerminalPositionImpl,
    updateCanvasTerminalSessionImpl,
    updateCanvasTerminalSizeImpl,
} from './canvas-terminal-actions'
import { canvasTerminalIdCounter } from './id-state'
import type { WorkspaceSlice } from './types'

type WorkspaceTerminalActions = Pick<WorkspaceSlice,
    | 'addCanvasTerminal'
    | 'removeCanvasTerminal'
    | 'updateCanvasTerminalPosition'
    | 'updateCanvasTerminalSize'
    | 'updateCanvasTerminalSession'
>

export function createWorkspaceTerminalActions(set: WorkspaceSetState, get: WorkspaceGetState): WorkspaceTerminalActions {
    return {
        addCanvasTerminal: () => addCanvasTerminalImpl(get, set, canvasTerminalIdCounter),
        removeCanvasTerminal: (id) => removeCanvasTerminalImpl(set, id),
        updateCanvasTerminalPosition: (id, x, y) => updateCanvasTerminalPositionImpl(set, id, x, y),
        updateCanvasTerminalSize: (id, width, height) => updateCanvasTerminalSizeImpl(set, id, width, height),
        updateCanvasTerminalSession: (id, sessionId, connected) => updateCanvasTerminalSessionImpl(set, id, sessionId, connected),
    }
}
