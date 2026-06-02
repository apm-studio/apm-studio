import { describe, expect, it } from 'vitest'
import {
    STUDIO_AGENT_ASSISTANT_UI_ENABLED,
    STUDIO_AGENT_TEAMS_UI_ENABLED,
    getStudioAgentVisibleFocusSnapshot,
    getStudioAgentVisibleSplitPanes,
    shouldRenderStudioAgentAssistantPanel,
    shouldRenderStudioAgentTeamsUi,
} from './studio-agent-ui-state'

describe('studio agent ui state', () => {
    it('parks Teams UI behind an explicit re-enable guard', () => {
        expect(STUDIO_AGENT_TEAMS_UI_ENABLED).toBe(false)
        expect(shouldRenderStudioAgentTeamsUi()).toBe(false)
        expect(getStudioAgentVisibleFocusSnapshot({ nodeId: 'team-1', type: 'team' })).toBeNull()
        expect(getStudioAgentVisibleFocusSnapshot({ nodeId: 'agent-1', type: 'agent' })).toEqual({
            nodeId: 'agent-1',
            type: 'agent',
        })
        expect(getStudioAgentVisibleSplitPanes([
            { paneId: 'team-pane', nodeId: 'team-1', type: 'team' },
            { paneId: 'agent-pane', nodeId: 'agent-1', type: 'agent' },
        ])).toEqual([
            { paneId: 'agent-pane', nodeId: 'agent-1', type: 'agent' },
        ])
    })

    it('parks Studio Assistant UI behind an explicit re-enable guard', () => {
        expect(STUDIO_AGENT_ASSISTANT_UI_ENABLED).toBe(false)
        expect(shouldRenderStudioAgentAssistantPanel({
            isAssistantOpen: true,
            isAnyFullscreenActive: false,
        })).toBe(false)
    })
})
