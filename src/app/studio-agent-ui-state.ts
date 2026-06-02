import type { FullscreenNodeType } from '../store/workspace/types'

// Teams and APM Assistant are intentionally hidden from the Studio Agent UI while
// those surfaces are reworked. Do not delete the underlying Team/Assistant codepaths;
// flip these guards when the upgraded UI is ready to return.
export const STUDIO_AGENT_TEAMS_UI_ENABLED = false
export const STUDIO_AGENT_ASSISTANT_UI_ENABLED = false

export function shouldRenderStudioAgentTeamsUi() {
    return STUDIO_AGENT_TEAMS_UI_ENABLED
}

export function shouldRenderStudioAgentAssistantPanel({
    isAssistantOpen,
    isAnyFullscreenActive,
}: {
    isAssistantOpen: boolean
    isAnyFullscreenActive: boolean
}) {
    return STUDIO_AGENT_ASSISTANT_UI_ENABLED && isAssistantOpen && !isAnyFullscreenActive
}

export function getStudioAgentVisibleFocusSnapshot<T extends { type: FullscreenNodeType }>(
    focusSnapshot: T | null | undefined,
): T | null {
    if (!focusSnapshot) return null
    if (STUDIO_AGENT_TEAMS_UI_ENABLED || focusSnapshot.type !== 'team') return focusSnapshot
    return null
}

export function getStudioAgentVisibleSplitPanes<T extends { type: FullscreenNodeType }>(panes: T[]): T[] {
    if (STUDIO_AGENT_TEAMS_UI_ENABLED) return panes
    return panes.filter((pane) => pane.type !== 'team')
}
