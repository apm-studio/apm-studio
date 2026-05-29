import type { StudioState } from '../types'

export type WorkspaceGetState = () => StudioState
export type WorkspaceSetState = (
    partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)
) => void
