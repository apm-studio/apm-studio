import {
    AGENT_DEFAULT_HEIGHT,
    AGENT_DEFAULT_WIDTH,
} from './agents-node'

export const TEAM_DEFAULT_WIDTH = AGENT_DEFAULT_WIDTH * 2
export const TEAM_DEFAULT_EXPANDED_HEIGHT = AGENT_DEFAULT_HEIGHT * 2
export const TEAM_MIN_EXPANDED_HEIGHT = 360
export const TEAM_COLLAPSED_HEIGHT = 116

export function resolveTeamExpandedHeight(height: number | null | undefined) {
    if (typeof height !== 'number' || !Number.isFinite(height)) {
        return TEAM_DEFAULT_EXPANDED_HEIGHT
    }

    return Math.max(TEAM_MIN_EXPANDED_HEIGHT, height)
}
