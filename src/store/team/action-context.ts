import type { StudioState } from '../types'

export type TeamGetState = () => StudioState
export type TeamSetState = (
    partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)
) => void
