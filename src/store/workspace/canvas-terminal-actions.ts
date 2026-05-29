import { mapCanvasTerminals, resolveCanvasSpawnPosition } from './helpers'
import type { StudioState } from '../types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export function addCanvasTerminalImpl(
    get: GetState,
    set: SetState,
    canvasTerminalIdCounter: { value: number },
) {
    canvasTerminalIdCounter.value++
    const id = `canvas-term-${canvasTerminalIdCounter.value}`
    const title = `Terminal ${canvasTerminalIdCounter.value}`
    const state = get()
    const spawnPosition = resolveCanvasSpawnPosition({
        canvasCenter: state.canvasCenter,
        existingCount: state.canvasTerminals.length,
        width: 600,
        height: 400,
    })
    set((state: StudioState) => ({
        canvasTerminals: [
            ...state.canvasTerminals,
            {
                id,
                title,
                position: spawnPosition,
                width: 600,
                height: 400,
                sessionId: null,
                connected: false,
            },
        ],
        workspaceDirty: true,
    }))
}

export function removeCanvasTerminalImpl(set: SetState, id: string) {
    set((state: StudioState) => ({
        canvasTerminals: state.canvasTerminals.filter((terminal) => terminal.id !== id),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalPositionImpl(set: SetState, id: string, x: number, y: number) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, position: { x, y } })),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalSizeImpl(set: SetState, id: string, width: number, height: number) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, width, height })),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalSessionImpl(set: SetState, id: string, sessionId: string | null, connected: boolean) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, sessionId, connected })),
    }))
}
